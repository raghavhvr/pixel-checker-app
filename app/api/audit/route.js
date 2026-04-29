// app/api/audit/route.js — Runtime audit endpoint, Vercel-optimized
//
// VERCEL DEPLOYMENT REQUIREMENTS:
//   1. Set env var in Vercel Dashboard (not in code): NODE_OPTIONS="--no-warnings"
//   2. Disable "Fluid Compute" in Project Settings → Functions
//   3. Set function memory to 1024MB+ (configured in vercel.json)
//   4. Pro plan required for 60s maxDuration
//
// LOCAL DEV: requires `npx playwright install --with-deps chromium`

import { NextResponse } from "next/server";
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
 * Launch Chromium based on environment.
 *
 * On Vercel/Lambda: use @sparticuz/chromium with playwright-core. Sparticuz ships
 *   Chromium + its system libs as a self-contained tarball that extracts to /tmp.
 *
 * Locally: use full `playwright` package (with its own Chromium download).
 *   This requires `npx playwright install --with-deps chromium` once.
 */
const launchBrowser = async () => {
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isServerless) {
    // Critical: import these dynamically so Next.js doesn't try to bundle them
    const chromium = (await import("@sparticuz/chromium")).default;
    const { chromium: playwrightChromium } = await import("playwright-core");

    // Sparticuz's recommended args + headless mode flag
    return playwrightChromium.launch({
      args: [
        ...chromium.args,
        "--hide-scrollbars",
        "--disable-web-security",
      ],
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  // Local / Docker — use full Playwright
  let pw;
  try {
    pw = await import("playwright");
  } catch {
    pw = await import("playwright-core");
  }
  return pw.chromium.launch({
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
      if (msg.includes("libnss3") || msg.includes("libnspr4") || msg.includes("shared libraries") || msg.includes("error while loading")) {
        return NextResponse.json({
          error: "Chromium failed to launch — system library or environment issue",
          detail: msg,
          fixes: process.env.VERCEL ? [
            "1. In Vercel Project Settings → Functions: DISABLE 'Fluid Compute'. This is the most common cause.",
            "2. Confirm the function has 1024MB+ memory (Pro plan required).",
            "3. Verify @sparticuz/chromium and playwright-core versions match the supported Chromium version.",
            "4. Try re-deploying — Sparticuz extracts to /tmp on cold start; sometimes the extraction fails on first run.",
            "5. If it still fails, the environment may not support Sparticuz — switch to a Docker deployment (see Dockerfile).",
          ] : [
            "Local dev: run `npx playwright install --with-deps chromium`",
            "Or build the Dockerfile in this repo, which uses Microsoft's Playwright image with all deps pre-installed.",
          ],
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
  });
}
