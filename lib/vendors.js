// lib/vendors.js — vendor classification + audit rules

export const KNOWN_VENDORS = {
  "doubleclick.net": { name: "Google CM360 / Floodlight", trust: "high", category: "ad-tech", isFloodlight: true },
  "fls.doubleclick.net": { name: "Floodlight Activity", trust: "high", category: "ad-tech", isFloodlight: true },
  "googletagmanager.com": { name: "Google Tag Manager", trust: "high", category: "tag-mgr" },
  "google-analytics.com": { name: "Google Analytics", trust: "high", category: "analytics" },
  "googleadservices.com": { name: "Google Ads", trust: "high", category: "ad-tech" },
  "googlesyndication.com": { name: "Google AdSense", trust: "high", category: "ad-tech" },
  "google.com": { name: "Google", trust: "high", category: "ad-tech" },
  "facebook.com": { name: "Meta Pixel", trust: "high", category: "ad-tech" },
  "facebook.net": { name: "Meta", trust: "high", category: "ad-tech" },
  "connect.facebook.net": { name: "Meta Pixel", trust: "high", category: "ad-tech" },
  "linkedin.com": { name: "LinkedIn Insight", trust: "high", category: "ad-tech" },
  "licdn.com": { name: "LinkedIn", trust: "high", category: "ad-tech" },
  "ads.linkedin.com": { name: "LinkedIn Ads", trust: "high", category: "ad-tech" },
  "twitter.com": { name: "X / Twitter", trust: "high", category: "ad-tech" },
  "t.co": { name: "X / Twitter", trust: "high", category: "ad-tech" },
  "ads-twitter.com": { name: "X Ads", trust: "high", category: "ad-tech" },
  "tiktok.com": { name: "TikTok Pixel", trust: "high", category: "ad-tech" },
  "analytics.tiktok.com": { name: "TikTok Analytics", trust: "high", category: "ad-tech" },
  "snapchat.com": { name: "Snap Pixel", trust: "high", category: "ad-tech" },
  "sc-static.net": { name: "Snap", trust: "high", category: "ad-tech" },
  "pinterest.com": { name: "Pinterest Tag", trust: "high", category: "ad-tech" },
  "ct.pinterest.com": { name: "Pinterest", trust: "high", category: "ad-tech" },
  "bing.com": { name: "Microsoft Bing Ads", trust: "high", category: "ad-tech" },
  "criteo.com": { name: "Criteo", trust: "medium", category: "ad-tech" },
  "criteo.net": { name: "Criteo", trust: "medium", category: "ad-tech" },
  "taboola.com": { name: "Taboola", trust: "medium", category: "ad-tech" },
  "outbrain.com": { name: "Outbrain", trust: "medium", category: "ad-tech" },
  "rubiconproject.com": { name: "Rubicon / Magnite", trust: "medium", category: "ad-exchange" },
  "openx.net": { name: "OpenX", trust: "medium", category: "ad-exchange" },
  "pubmatic.com": { name: "PubMatic", trust: "medium", category: "ad-exchange" },
  "adnxs.com": { name: "AppNexus / Xandr", trust: "medium", category: "ad-exchange" },
  "casalemedia.com": { name: "Index Exchange", trust: "medium", category: "ad-exchange" },
  "scorecardresearch.com": { name: "Comscore", trust: "medium", category: "analytics" },
  "quantserve.com": { name: "Quantcast", trust: "medium", category: "analytics" },
  "demdex.net": { name: "Adobe Audience Mgr", trust: "high", category: "data-mgmt" },
  "everesttech.net": { name: "Adobe Advertising", trust: "high", category: "ad-tech" },
  "omtrdc.net": { name: "Adobe Analytics", trust: "high", category: "analytics" },
  "2o7.net": { name: "Adobe Analytics (legacy)", trust: "high", category: "analytics" },
  "adobedtm.com": { name: "Adobe Launch", trust: "high", category: "tag-mgr" },
  "tealiumiq.com": { name: "Tealium", trust: "high", category: "tag-mgr" },
  "ensighten.com": { name: "Ensighten", trust: "high", category: "tag-mgr" },
  "segment.com": { name: "Segment", trust: "high", category: "data-mgmt" },
  "segment.io": { name: "Segment", trust: "high", category: "data-mgmt" },
  "mixpanel.com": { name: "Mixpanel", trust: "high", category: "analytics" },
  "amplitude.com": { name: "Amplitude", trust: "high", category: "analytics" },
  "hotjar.com": { name: "Hotjar", trust: "medium", category: "session-replay" },
  "fullstory.com": { name: "FullStory", trust: "medium", category: "session-replay" },
  "mouseflow.com": { name: "Mouseflow", trust: "medium", category: "session-replay" },
};

export const PII_QUERY_KEYS = [
  "email", "e_mail", "e-mail", "mail", "phone", "tel", "ssn", "dob",
  "fname", "lname", "firstname", "lastname", "fullname",
  "address", "street", "zip", "postal", "cc", "card", "ccnum", "creditcard",
];

export const matchVendor = (host) => {
  if (!host) return null;
  for (const domain in KNOWN_VENDORS) {
    if (host === domain || host.endsWith("." + domain)) {
      return { domain, ...KNOWN_VENDORS[domain] };
    }
  }
  return null;
};

export const getHost = (url) => {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
};

export const isFloodlightUrl = (url) => {
  const h = getHost(url);
  return h && (h.endsWith(".fls.doubleclick.net") || h === "fls.doubleclick.net" ||
               (h.endsWith(".doubleclick.net") && url.includes("activityi")));
};

export const parseFloodlight = (url) => {
  try {
    const u = new URL(url);
    const params = {};
    const segments = u.pathname.split(";").slice(1).concat(u.search.replace(/^\?/, "").split(";"));
    for (const seg of segments) {
      const [k, v] = seg.split("=");
      if (k) params[k] = v || "";
    }
    return {
      account: params.src,
      type: params.type,
      category: params.cat,
      customVars: Object.entries(params).filter(([k]) => /^u\d+$/.test(k)),
      ord: params.ord,
    };
  } catch { return null; }
};

// Audit a single network request captured at runtime
export const auditRequest = (req) => {
  const findings = [];
  const url = req.url;
  const host = getHost(url);
  const vendor = matchVendor(host);

  // Non-TLS
  if (url.startsWith("http://")) {
    findings.push({
      area: "security", severity: "block",
      title: "Non-TLS request",
      detail: "Request fired over plain HTTP. Will be blocked as mixed content on HTTPS pages.",
    });
  }

  // PII in query params
  try {
    const u = new URL(url);
    const piiHits = [];
    for (const [k, v] of u.searchParams.entries()) {
      const kl = k.toLowerCase();
      if (PII_QUERY_KEYS.some((p) => kl.includes(p)) && v) {
        piiHits.push(`${k}=${v.slice(0, 40)}${v.length > 40 ? "…" : ""}`);
      }
    }
    if (piiHits.length > 0) {
      findings.push({
        area: "privacy", severity: "block",
        title: "PII-shaped data in URL parameters",
        detail: "Personal data flowing in URLs creates GDPR/CCPA exposure.",
        evidence: piiHits.slice(0, 5),
      });
    }
    // Floodlight u1-uN custom vars carrying PII shapes
    if (isFloodlightUrl(url)) {
      const fl = parseFloodlight(url);
      const flPii = [];
      for (const [k, v] of fl?.customVars || []) {
        if (v && (v.includes("@") || /\d{7,}/.test(v))) {
          flPii.push(`${k}=${v.slice(0, 40)}`);
        }
      }
      if (flPii.length > 0) {
        findings.push({
          area: "privacy", severity: "block",
          title: "PII-shaped data in Floodlight custom variables",
          detail: "Floodlight u1–uN custom variables contain values that look like emails or long IDs.",
          evidence: flPii,
        });
      }
    }
  } catch {}

  // Unrecognized vendor (skip the parent Floodlight host itself)
  if (!vendor && !isFloodlightUrl(url)) {
    findings.push({
      area: "security", severity: "warn",
      title: "Unrecognized vendor domain",
      detail: "Host not in the known ad-tech allowlist. Confirm with the agency before deploying.",
      evidence: [host],
    });
  }

  // Slow / failed requests
  if (req.status === 0 || req.failed) {
    findings.push({
      area: "performance", severity: "warn",
      title: "Request failed",
      detail: req.failureText || "Request did not complete successfully.",
    });
  }
  if (req.duration && req.duration > 2000) {
    findings.push({
      area: "performance", severity: "warn",
      title: `Slow response (${req.duration}ms)`,
      detail: "Slow piggybacks delay page interactivity.",
    });
  }

  // Suspicious response content type for what should be a tracking pixel
  // (skip — content-type checks are noisy in practice)

  const hasBlock = findings.some((f) => f.severity === "block");
  const hasWarn = findings.some((f) => f.severity === "warn");
  const verdict = hasBlock ? "block" : hasWarn ? "warn" : "safe";

  return {
    url,
    host,
    vendor,
    isFloodlight: isFloodlightUrl(url),
    floodlightInfo: isFloodlightUrl(url) ? parseFloodlight(url) : null,
    method: req.method,
    status: req.status,
    contentType: req.contentType,
    duration: req.duration,
    initiator: req.initiator,
    redirectChain: req.redirectChain || [],
    findings,
    verdict,
  };
};

export const validateInput = (code) => {
  const issues = [];
  if (/…/.test(code)) {
    issues.push({
      severity: "block",
      title: "Tag appears truncated (… ellipsis character found)",
      detail: "The pasted code contains an ellipsis (…), which usually means it was copied from email or rich-text. The Floodlight URL won't fire correctly.",
      fix: "Open the original tag from CM360 → Floodlight Activity → 'Install' and copy from the code box.",
    });
  }
  if (/[\u201C\u201D\u2018\u2019]/.test(code)) {
    issues.push({
      severity: "block",
      title: "Smart quotes detected",
      detail: "The tag contains curly quotes instead of straight ones. JavaScript will throw a syntax error.",
      fix: "Re-copy directly from CM360 or a plain-text source.",
    });
  }
  return issues;
};
