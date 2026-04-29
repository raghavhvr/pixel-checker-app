// app/api/audit/route.js — Runtime audit endpoint
import { NextResponse } from "next/server";
import { auditRequest, isFloodlightUrl, getHost, validateInput } from "@/lib/vendors";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel allows up to 60s on Pro plan

// Configuration
const CAPTURE_WINDOW_MS = 8000; // How long to wait after firing tag for piggybacks to load
const MAX_REQUESTS = 200; // Safety cap
const VIEWPORT = { width: 1280, height: 800 };

/**
 * Build the host page HTML that wraps the user's Floodlight tag.
 * The page is plain HTML5 with the tag injected in <body>.
 * We add a base <meta> for HTTPS context and a marker <div> to confirm load.
 */
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

  // Pre-flight static checks
  const inputIssues = validateInput(tagCode);
  if (inputIssues.some((i) => i.severity === "block")) {
    return NextResponse.json({
      ok: true,
      stage: "input-validation",
      inputIssues,
      message: "Cannot fire tag — fix input issues first",
      requests: [],
    });
  }

  // ── Lazy-load playwright + chromium so the route still builds locally
  // even if these aren't installed. Runtime resolution.
  let chromium, playwright;
  try {
    chromium = (await import("@sparticuz/chromium")).default;
    playwright = await import("playwright-core");
  } catch (e) {
    return NextResponse.json({
      error: "Playwright/Chromium not installed in this environment.",
      detail: e.message,
      hint: "Run `npm install` and ensure @sparticuz/chromium and playwright-core are in deps.",
    }, { status: 500 });
  }

  let browser;
  try {
    const isVercel = !!process.env.VERCEL;
    browser = await playwright.chromium.launch({
      args: isVercel ? chromium.args : ["--no-sandbox"],
      executablePath: isVercel ? await chromium.executablePath() : undefined,
      headless: true,
    });

    const context = await browser.newContext({
      viewport: VIEWPORT,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      // Don't accept cookies on a sandbox — but allow them for the audit flow
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();

    // ── Network capture
    const requests = [];
    const requestStarts = new Map(); // url → start timestamp
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
        url,
        host: getHost(url),
        method: request.method(),
        status: 0,
        failed: true,
        failureText: failure?.errorText || "Request failed",
        duration: requestStarts.has(url) ? Date.now() - requestStarts.get(url) : null,
        initiator: request.frame()?.url() || null,
        redirectChain: request.redirectedFrom() ? [request.redirectedFrom().url()] : [],
      });
    });

    page.on("response", async (response) => {
      const request = response.request();
      const url = request.url();
      // Skip the data: and about: URIs we serve ourselves
      if (url.startsWith("data:") || url === "about:blank") return;
      // Skip the host page itself (we serve it from data:)
      if (url.startsWith("about:srcdoc") || url.includes("audit-sandbox")) return;

      const duration = requestStarts.has(url) ? Date.now() - requestStarts.get(url) : null;
      const redirectChain = [];
      let r = request.redirectedFrom();
      while (r) { redirectChain.push(r.url()); r = r.redirectedFrom(); }

      requests.push({
        url,
        host: getHost(url),
        method: request.method(),
        status: response.status(),
        contentType: response.headers()["content-type"] || null,
        duration,
        initiator: request.frame()?.url() || null,
        redirectChain: redirectChain.reverse(),
      });
    });

    // ── Load the host page with the tag
    const hostHtml = buildHostPage(tagCode);
    // Use setContent rather than navigating to data: URL to avoid CSP weirdness
    await page.goto("https://example.com/", { waitUntil: "domcontentloaded", timeout: 15000 })
      .catch(() => {}); // we don't actually care about example.com loading
    await page.setContent(hostHtml, { waitUntil: "networkidle", timeout: CAPTURE_WINDOW_MS })
      .catch(() => {}); // networkidle may not be reached if there are persistent connections

    // Give piggybacks time to fire after document load
    await page.waitForTimeout(CAPTURE_WINDOW_MS);

    // Confirm the audit marker is in the DOM (i.e., page loaded properly)
    let markerFound = false;
    try {
      markerFound = (await page.locator("#audit-marker").count()) > 0;
    } catch {}

    await browser.close();
    browser = null;

    // ── Filter & deduplicate
    // Drop requests for example.com (our placeholder navigation target)
    const filtered = requests.filter((r) => {
      if (!r.url) return false;
      if (r.url.includes("example.com")) return false;
      return true;
    });

    // ── Audit each request
    const audited = filtered.map(auditRequest);

    // ── Group: parent Floodlight vs piggybacks
    const floodlightRequests = audited.filter((r) => r.isFloodlight);
    const piggybackRequests = audited.filter((r) => !r.isFloodlight);

    // ── Overall verdict
    const allFindings = audited.flatMap((r) => r.findings);
    const hasBlock = inputIssues.some((i) => i.severity === "block") ||
                     allFindings.some((f) => f.severity === "block");
    const hasWarn = allFindings.some((f) => f.severity === "warn") ||
                    inputIssues.some((i) => i.severity === "warn");
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
  });
}
