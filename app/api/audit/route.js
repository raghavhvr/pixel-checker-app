// app/api/audit/route.js — Runtime audit endpoint
//
// VERCEL DEPLOYMENT REQUIREMENTS (do all four):
//
//   1. In Vercel Dashboard → Project → Settings → Environment Variables, ADD:
//        AWS_LAMBDA_JS_RUNTIME = nodejs20.x
//      This MUST be set in the dashboard, not in code. Sparticuz checks this
//      env var at module-import time, before any of your code runs.
//
//   2. In Vercel Dashboard → Project → Settings → Functions:
//        - Disable "Fluid Compute" (toggle OFF)
//        - Confirm memory is 1024MB+
//
//   3. Pro plan required for the 60s maxDuration in vercel.json.
//
//   4. After making the above changes, force a fresh deploy:
//        vercel --prod --force
//      OR push a new commit. Old function builds may use cached settings.

import { NextResponse } from "next/server";
import path from "node:path";
import { auditRequest, isFloodlightUrl, getHost, validateInput } from "@/lib/vendors";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const CAPTURE_WINDOW_MS = 8000;
const MAX_REQUESTS = 200;
const VIEWPORT = { width: 1280, height: 800 };

const buildHostPage = (tagCode) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Pixel Audit Sandbox</title>
  <meta name="referrer" content="no-referrer-when-downgrade">
</head>
<body>
  <div id="audit-marker">audit-running</div>
  ${tagCode}
</body>
</html>`;

/**
 * Launch Chromium. The Vercel-correct setup requires three things beyond
 * the basic Sparticuz example:
 *   - AWS_LAMBDA_JS_RUNTIME set BEFORE module imports (do this in Dashboard)
 *   - LD_LIBRARY_PATH set to Chromium's extraction directory before launch
 *   - chromiumPack.setGraphicsMode(false) to avoid a known freezing bug
 */
const launchBrowser = async () => {
  const { chromium } = await import("playwright-core");
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isServerless) {
    const sparticuz = (await import("@sparticuz/chromium")).default;

    // Fallback: if AWS_LAMBDA_JS_RUNTIME wasn't set in the Vercel Dashboard, set it here.
    // (The proper place is the Dashboard, but this catches the case where someone
    // forgot to set it — Sparticuz already imported, but some downstream checks
    // still read this var.)
    if (!process.env.AWS_LAMBDA_JS_RUNTIME) {
      process.env.AWS_LAMBDA_JS_RUNTIME = "nodejs20.x";
    }

    // Disable graphics mode to prevent the "Target page, context or browser closed" freeze
    if (typeof sparticuz.setGraphicsMode === "function") {
      sparticuz.setGraphicsMode = false;
    }

    // Get the executable path — Sparticuz extracts Chromium + libs to /tmp on first call
    const executablePath = await sparticuz.executablePath();

    // CRITICAL FIX: tell the Linux dynamic loader where Chromium's bundled .so files live.
    // Without this, /tmp/chromium can't find libnss3.so even though Sparticuz extracted it.
    // This is the documented fix for the libnss3 / libnspr4 errors on Vercel in 2026.
    const execDir = path.dirname(executablePath);
    process.env.LD_LIBRARY_PATH = execDir + (process.env.LD_LIBRARY_PATH ? ":" + process.env.LD_LIBRARY_PATH : "");

    return chromium.launch({
      args: [
        ...sparticuz.args,
        "--hide-scrollbars",
        "--disable-web-security",
      ],
      executablePath,
      headless: true,
    });
  }

  // Local: rely on playwright-core finding Chromium that was installed via
  // `npx playwright install chromium`. If it's not installed, this throws
  // a clear "Executable doesn't exist" error.
  return chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
};

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { tagCode } = body || {};
  if (!tagCode || typeof tagCode !== "string" || tagCode.length < 20) {
    return NextResponse.json({ error: "Missing or empty tagCode" }, { status: 400 });
  }
  if (tagCode.length > 100_000) {
    return NextResponse.json({ error: "Tag code too large (>100kb)" }, { status: 400 });
  }

  const inputIssues = validateInput(tagCode);
  if (inputIssues.some((i) => i.severity === "block")) {
    return NextResponse.json({
      ok: true,
      stage: "input-validation",
      verdict: "block",
      inputIssues,
      message: "Cannot fire tag — fix input issues first",
      floodlights: [],
      piggybacks: [],
      stats: { totalRequests: 0, floodlightRequests: 0, piggybackRequests: 0, uniqueHosts: 0 },
    });
  }

  let browser;
  try {
    try {
      browser = await launchBrowser();
    } catch (launchErr) {
      const msg = launchErr.message || "";
      if (msg.includes("libnss3") || msg.includes("libnspr4") || msg.includes("shared libraries")) {
        return NextResponse.json({
          error: "Chromium failed to launch — system library issue persists",
          detail: msg,
          fixes: [
            "1. CRITICAL: In Vercel Dashboard → Project → Settings → Environment Variables, set AWS_LAMBDA_JS_RUNTIME=nodejs20.x. Then REDEPLOY (env vars don't take effect on existing builds).",
            "2. Disable 'Fluid Compute' in Settings → Functions.",
            "3. Confirm function memory is 1024MB+ (requires Pro plan).",
            "4. If all of the above are done and it still fails, switch to Docker on Railway/Fly.io. Vercel + Sparticuz has known fragility issues — Docker is more reliable.",
          ],
          environmentCheck: {
            VERCEL: !!process.env.VERCEL,
            AWS_LAMBDA_JS_RUNTIME: process.env.AWS_LAMBDA_JS_RUNTIME || "(not set — set in Vercel Dashboard)",
            LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH || "(not set)",
          },
        }, { status: 500 });
      }
      throw launchErr;
    }

    const context = await browser.newContext({
      viewport: VIEWPORT,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();

    const requests = [];
    const requestStarts = new Map();
    let requestCount = 0;

    page.on("request", (request) => {
      if (requestCount++ > MAX_REQUESTS) return;
      requestStarts.set(request.url(), Date.now());
    });

    page.on("requestfailed", (request) => {
      const url = request.url();
      if (url === "about:blank" || url.startsWith("data:")) return;
      const failure = request.failure();
      requests.push({
        url, host: getHost(url), method: request.method(),
        status: 0, failed: true,
        failureText: failure?.errorText || "Request failed",
        duration: requestStarts.has(url) ? Date.now() - requestStarts.get(url) : null,
        initiator: request.frame()?.url() || null,
        redirectChain: request.redirectedFrom() ? [request.redirectedFrom().url()] : [],
      });
    });

    page.on("response", async (response) => {
      const request = response.request();
      const url = request.url();
      if (url.startsWith("data:") || url === "about:blank" || url.startsWith("about:srcdoc")) return;
      const duration = requestStarts.has(url) ? Date.now() - requestStarts.get(url) : null;
      const redirectChain = [];
      let r = request.redirectedFrom();
      while (r) { redirectChain.push(r.url()); r = r.redirectedFrom(); }
      requests.push({
        url, host: getHost(url), method: request.method(),
        status: response.status(),
        contentType: response.headers()["content-type"] || null,
        duration,
        initiator: request.frame()?.url() || null,
        redirectChain: redirectChain.reverse(),
      });
    });

    const hostHtml = buildHostPage(tagCode);
    await page.goto("https://example.com/", { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    await page.setContent(hostHtml, { waitUntil: "networkidle", timeout: CAPTURE_WINDOW_MS }).catch(() => {});
    await page.waitForTimeout(CAPTURE_WINDOW_MS);

    let markerFound = false;
    try { markerFound = (await page.locator("#audit-marker").count()) > 0; } catch {}

    await browser.close();
    browser = null;

    const filtered = requests.filter((r) => r.url && !r.url.includes("example.com"));
    const audited = filtered.map(auditRequest);
    const floodlightRequests = audited.filter((r) => r.isFloodlight);
    const piggybackRequests = audited.filter((r) => !r.isFloodlight);

    const allFindings = audited.flatMap((r) => r.findings);
    const hasBlock = allFindings.some((f) => f.severity === "block");
    const hasWarn = allFindings.some((f) => f.severity === "warn");
    const verdict = hasBlock ? "block" : hasWarn ? "warn" : "safe";

    return NextResponse.json({
      ok: true,
      verdict,
      markerFound,
      inputIssues,
      stats: {
        totalRequests: audited.length,
        floodlightRequests: floodlightRequests.length,
        piggybackRequests: piggybackRequests.length,
        uniqueHosts: new Set(audited.map((r) => r.host).filter(Boolean)).size,
      },
      floodlights: floodlightRequests,
      piggybacks: piggybackRequests,
      capturedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (browser) try { await browser.close(); } catch {}
    return NextResponse.json({
      error: "Audit failed",
      detail: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "POST { tagCode: string } to fire the tag in headless Chrome and capture piggybacks.",
    runtime: process.env.VERCEL ? "vercel-serverless" : "local",
    env: {
      VERCEL: !!process.env.VERCEL,
      AWS_LAMBDA_JS_RUNTIME: process.env.AWS_LAMBDA_JS_RUNTIME || "(not set)",
    },
  });
}
