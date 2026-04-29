"use client";

import React, { useState, useMemo } from "react";
import {
  Shield, Eye, Zap, AlertTriangle, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, Trash2, Radio, Activity, Lock,
  Target, GitBranch, Loader2, Info, Scissors, ExternalLink,
  Clock, Network,
} from "lucide-react";

const SAMPLE_TAG = `<!-- Standard CM360 Floodlight - paste yours instead -->
<script type="text/javascript">
  var axel = Math.random() + "";
  var a = axel * 10000000000000;
  document.write('<iframe src="https://6789.fls.doubleclick.net/activityi;src=6789;type=conv0;cat=signu0;dc_lat=;dc_rdid=;tag_for_child_directed_treatment=;tfua=;npa=;ord=' + a + '?" width="1" height="1" frameborder="0"></iframe>');
</script>
<noscript>
  <iframe src="https://6789.fls.doubleclick.net/activityi;src=6789;type=conv0;cat=signu0;ord=1?" width="1" height="1" frameborder="0"></iframe>
</noscript>`;

// ══════════ UI Components ══════════

const VerdictPill = ({ verdict, size = "md" }) => {
  const cfg = {
    safe: { label: "PASS", icon: CheckCircle2, cls: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10" },
    warn: { label: "REVIEW", icon: AlertTriangle, cls: "text-amber-300 border-amber-500/40 bg-amber-500/10" },
    block: { label: "BLOCK", icon: XCircle, cls: "text-rose-300 border-rose-500/40 bg-rose-500/10" },
  }[verdict] || { label: "—", icon: Radio, cls: "text-zinc-400 border-zinc-700 bg-zinc-900" };
  const Icon = cfg.icon;
  const pad = size === "lg" ? "px-4 py-2 text-sm" : "px-2.5 py-1 text-[11px]";
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-sm border ${cfg.cls} ${pad} font-mono uppercase tracking-[0.2em]`}>
      <Icon className={size === "lg" ? "w-4 h-4" : "w-3 h-3"} strokeWidth={2.5} />
      {cfg.label}
    </div>
  );
};

const AreaIcon = ({ area }) => ({
  security: <Lock className="w-3 h-3" />,
  privacy: <Eye className="w-3 h-3" />,
  performance: <Zap className="w-3 h-3" />,
  input: <Scissors className="w-3 h-3" />,
}[area] || <Activity className="w-3 h-3" />);

const Finding = ({ f }) => {
  const [open, setOpen] = useState(false);
  const sevColor = {
    block: "border-l-rose-500 bg-rose-500/[0.04]",
    warn: "border-l-amber-500 bg-amber-500/[0.04]",
  }[f.severity] || "border-l-zinc-700";
  return (
    <div className={`border-l-2 ${sevColor} pl-3 py-2`}>
      <button onClick={() => setOpen(!open)} className="w-full text-left flex items-start gap-2">
        {open ? <ChevronDown className="w-3.5 h-3.5 mt-1 text-zinc-500 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 mt-1 text-zinc-500 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {f.area && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                <AreaIcon area={f.area} /> {f.area}
              </span>
            )}
            <span className="text-zinc-100 text-sm">{f.title}</span>
          </div>
          {open && (
            <div className="mt-2 space-y-1.5">
              <p className="text-zinc-400 text-xs leading-relaxed">{f.detail}</p>
              {f.fix && (
                <p className="text-emerald-300 text-xs leading-relaxed bg-emerald-500/5 border border-emerald-500/20 rounded-sm px-2 py-1.5">
                  <span className="font-mono uppercase tracking-wider text-[10px] text-emerald-500">Fix:</span> {f.fix}
                </p>
              )}
              {f.evidence?.length > 0 && (
                <div className="space-y-0.5">
                  {f.evidence.map((e, i) => (
                    <div key={i} className="text-[11px] font-mono text-zinc-500 break-all bg-black/30 px-2 py-1 rounded-sm border border-zinc-800">
                      {e}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </button>
    </div>
  );
};

const RequestCard = ({ req, idx }) => {
  const [expanded, setExpanded] = useState(req.findings.length > 0);
  const fl = req.floodlightInfo;

  return (
    <div className="border border-zinc-800 bg-zinc-950 rounded-sm overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full p-3 flex items-center gap-3 hover:bg-zinc-900/50 transition-colors text-left">
        <div className="font-mono text-[10px] text-zinc-600 tabular-nums w-6">#{String(idx + 1).padStart(2, "0")}</div>
        <VerdictPill verdict={req.verdict} />
        <div className="flex-1 min-w-0">
          <div className="text-zinc-200 text-xs font-mono truncate">
            {req.host || "(no host)"}
            {req.vendor && <span className="text-zinc-500 ml-2">— {req.vendor.name}</span>}
            {!req.vendor && !req.isFloodlight && <span className="text-amber-500 ml-2">— UNRECOGNIZED</span>}
          </div>
          <div className="text-[10px] text-zinc-600 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded-sm ${
              req.failed ? "bg-rose-500/20 text-rose-300" :
              req.status >= 200 && req.status < 300 ? "bg-emerald-500/15 text-emerald-300" :
              req.status >= 300 && req.status < 400 ? "bg-sky-500/15 text-sky-300" :
              "bg-amber-500/15 text-amber-300"
            }`}>
              {req.failed ? "FAIL" : req.status}
            </span>
            {req.method && <span>{req.method}</span>}
            {req.duration != null && (
              <span className="flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />{req.duration}ms
              </span>
            )}
            {req.redirectChain?.length > 0 && (
              <span className="text-sky-400">↳ {req.redirectChain.length} redirect{req.redirectChain.length > 1 ? "s" : ""}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {req.findings.filter((f) => f.severity === "block").length > 0 && (
            <span className="font-mono text-[10px] text-rose-400 px-1.5 py-0.5 bg-rose-500/10 rounded-sm">
              {req.findings.filter((f) => f.severity === "block").length}B
            </span>
          )}
          {req.findings.filter((f) => f.severity === "warn").length > 0 && (
            <span className="font-mono text-[10px] text-amber-400 px-1.5 py-0.5 bg-amber-500/10 rounded-sm">
              {req.findings.filter((f) => f.severity === "warn").length}W
            </span>
          )}
          {expanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800">
          {fl && (
            <div className="px-4 py-3 bg-sky-500/[0.03] border-b border-zinc-800">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-sky-400 mb-1.5">▸ Floodlight breakdown</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
                <div><span className="text-zinc-500">src:</span> <span className="text-zinc-200">{fl.account || "—"}</span></div>
                <div><span className="text-zinc-500">type:</span> <span className="text-zinc-200">{fl.type || "—"}</span></div>
                <div><span className="text-zinc-500">cat:</span> <span className="text-zinc-200">{fl.category || "—"}</span></div>
                <div><span className="text-zinc-500">ord:</span> <span className="text-zinc-200">{fl.ord ? "✓" : "—"}</span></div>
              </div>
              {fl.customVars?.length > 0 && (
                <div className="mt-2 pt-2 border-t border-sky-500/10">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">Custom variables</div>
                  {fl.customVars.map(([k, v], i) => (
                    <div key={i} className="text-[11px] font-mono text-zinc-400 break-all">
                      <span className="text-zinc-500">{k}:</span> {v || "<empty>"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {req.findings.length > 0 ? (
            <div className="p-3 space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">▸ Findings ({req.findings.length})</div>
              {req.findings.map((f, i) => <Finding key={i} f={f} />)}
            </div>
          ) : (
            <div className="p-3 flex items-center gap-2 text-emerald-400/80 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>No issues detected for this request.</span>
            </div>
          )}

          {req.redirectChain?.length > 0 && (
            <div className="p-3 border-t border-zinc-800">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-1.5">▸ Redirect chain</div>
              <div className="space-y-0.5 text-[11px] font-mono">
                {req.redirectChain.map((u, i) => (
                  <div key={i} className="text-sky-300/80 break-all">↳ {u}</div>
                ))}
                <div className="text-zinc-200 break-all">→ {req.url}</div>
              </div>
            </div>
          )}

          <div className="p-3 border-t border-zinc-800">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-1.5">▸ Full URL</div>
            <div className="text-[11px] font-mono text-zinc-400 break-all bg-black/30 p-2 rounded-sm border border-zinc-900">
              {req.url}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ══════════ Main ══════════

export default function PixelChecker() {
  const [tagCode, setTagCode] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  const handleAudit = async () => {
    if (!tagCode.trim()) return;
    setRunning(true);
    setResult(null);
    setError(null);

    try {
      const resp = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagCode }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "Audit failed");
        if (data.detail) setError((e) => `${e} — ${data.detail}`);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(`Network error: ${e.message}`);
    }
    setRunning(false);
  };

  const overall = useMemo(() => {
    if (!result) return null;
    return {
      verdict: result.verdict,
      ...result.stats,
    };
  }, [result]);

  return (
    <div className="min-h-screen bg-black text-zinc-200" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;700&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
        .grid-bg {
          background-image:
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 32px 32px;
        }
      `}</style>

      <header className="border-b border-zinc-900 grid-bg">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-10 h-10 border border-emerald-500/40 rounded-sm flex items-center justify-center bg-emerald-500/5">
                <Shield className="w-5 h-5 text-emerald-400" strokeWidth={2} />
              </div>
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            </div>
            <div>
              <h1 className="font-display text-xl tracking-tight text-zinc-100">PIXEL<span className="text-emerald-400">/</span>CHECK</h1>
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.25em] mt-0.5">
                Runtime piggyback auditor · Headless Chrome · v1.0
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-5 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            <span className="flex items-center gap-1.5"><Network className="w-3 h-3" /> Live fire</span>
            <span className="flex items-center gap-1.5"><Lock className="w-3 h-3" /> Security</span>
            <span className="flex items-center gap-1.5"><Eye className="w-3 h-3" /> Privacy</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* How it works */}
        <div className="mb-6 border border-sky-500/20 bg-sky-500/[0.03] rounded-sm p-4 flex gap-3">
          <Info className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-zinc-400 leading-relaxed">
            <span className="text-zinc-200 font-medium">How this works:</span> Paste your Floodlight tag below. The auditor injects it into a sandboxed page, fires it in headless Chrome, then captures every network request that results — including all piggybacks configured in CM360's Tag Manager tab. Each request is then checked for safety. Takes ~10 seconds.
          </div>
        </div>

        {/* Input */}
        <section className="border border-zinc-900 bg-zinc-950 rounded-sm overflow-hidden">
          <div className="border-b border-zinc-900 bg-zinc-900/30 px-4 py-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">▸ Floodlight tag</div>
          </div>
          <div className="p-4">
            <textarea
              value={tagCode}
              onChange={(e) => setTagCode(e.target.value)}
              placeholder="Paste your CM360 Floodlight tag here..."
              spellCheck={false}
              className="w-full h-64 bg-black border border-zinc-900 rounded-sm p-3 font-mono text-xs text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-emerald-500/40 resize-none"
            />
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <button onClick={() => setTagCode(SAMPLE_TAG)} className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-emerald-400 transition-colors">◇ Load sample</button>
              {tagCode && (
                <button onClick={() => setTagCode("")} className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-rose-400 transition-colors flex items-center gap-1 ml-auto">
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
            <button
              onClick={handleAudit}
              disabled={running || !tagCode.trim()}
              className="mt-4 w-full bg-emerald-500/15 hover:bg-emerald-500/25 disabled:bg-zinc-900 disabled:text-zinc-700 border border-emerald-500/40 disabled:border-zinc-800 text-emerald-300 font-mono uppercase tracking-[0.25em] text-xs py-3 rounded-sm transition-colors flex items-center justify-center gap-2"
            >
              {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Firing tag in headless Chrome…</> : <><Network className="w-4 h-4" /> Fire & audit ▸</>}
            </button>
          </div>
        </section>

        {error && (
          <div className="mt-6 border border-rose-500/30 bg-rose-500/5 rounded-sm p-4 flex gap-3">
            <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-rose-300">{error}</div>
          </div>
        )}

        {result && overall && (
          <section className="mt-8 space-y-4">
            <div className="border border-zinc-900 bg-zinc-950 rounded-sm p-5 flex items-center gap-5 flex-wrap">
              <VerdictPill verdict={overall.verdict} size="lg" />
              <div className="font-display text-xl text-zinc-100">
                {overall.verdict === "safe" && "Pixels appear safe to deploy"}
                {overall.verdict === "warn" && "Review required before deploy"}
                {overall.verdict === "block" && "Do not deploy — issues detected"}
              </div>
              <div className="ml-auto flex items-center gap-4 font-mono text-xs flex-wrap">
                <div className="flex items-center gap-2"><Target className="w-3 h-3 text-sky-400" /><span className="text-zinc-300">{overall.floodlightRequests}</span><span className="text-zinc-600 text-[10px] uppercase tracking-wider">Floodlight req</span></div>
                <div className="flex items-center gap-2"><GitBranch className="w-3 h-3 text-amber-400" /><span className="text-zinc-300">{overall.piggybackRequests}</span><span className="text-zinc-600 text-[10px] uppercase tracking-wider">Piggybacks</span></div>
                <div className="text-zinc-800">|</div>
                <div className="text-zinc-500">{overall.uniqueHosts} unique hosts</div>
              </div>
            </div>

            {result.inputIssues?.length > 0 && (
              <div className="border border-rose-500/30 bg-rose-500/5 rounded-sm p-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-rose-300 mb-2 flex items-center gap-2">
                  <Scissors className="w-3 h-3" /> Input issues
                </div>
                <div className="space-y-1.5">
                  {result.inputIssues.map((f, i) => <Finding key={i} f={{ ...f, area: "input" }} />)}
                </div>
              </div>
            )}

            <div className="border border-zinc-800 bg-zinc-950 rounded-sm overflow-hidden p-4 space-y-4">
              {/* Floodlights */}
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-sky-400 mb-2 flex items-center gap-2">
                  <Target className="w-3 h-3" /> Parent Floodlight Request{result.floodlights.length !== 1 ? "s" : ""} ({result.floodlights.length})
                </div>
                {result.floodlights.length === 0 ? (
                  <div className="border border-amber-500/30 bg-amber-500/5 rounded-sm p-3 flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-zinc-400 leading-relaxed">
                      <span className="text-amber-200 font-medium">No Floodlight request fired.</span> The tag may be malformed, or it may require a user interaction (click, form submit) to fire. Try a Page View Floodlight, which fires on load.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {result.floodlights.map((r, i) => <RequestCard key={i} req={r} idx={i} />)}
                  </div>
                )}
              </div>

              {/* Piggybacks */}
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber-400 mb-2 flex items-center gap-2">
                  <GitBranch className="w-3 h-3" /> Piggybacked Requests ({result.piggybacks.length})
                </div>
                {result.piggybacks.length === 0 ? (
                  <div className="border border-zinc-800 rounded-sm p-4 flex items-start gap-3 bg-zinc-900/30">
                    <Info className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-zinc-400 leading-relaxed">
                      <span className="text-zinc-200 font-medium">No piggybacks fired.</span> Either none are configured for this Floodlight in CM360's Tag Manager tab, or they failed to load within the {8}s capture window. This is a clean tag if intended — if you expected piggybacks, verify the CM360 configuration.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {result.piggybacks.map((r, i) => <RequestCard key={i} req={r} idx={i} />)}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {!result && !error && !running && (
          <section className="mt-12 grid md:grid-cols-3 gap-4">
            {[
              { icon: Network, title: "Real fire, not regex", desc: "Loads the tag into headless Chrome and captures every network request — including ad-server-injected piggybacks that don't exist in source code.", color: "text-sky-400" },
              { icon: GitBranch, title: "Piggyback chain", desc: "Sees what CM360 actually returns: every vendor URL chained via the Tag Manager tab, in firing order, with redirects and timing.", color: "text-amber-400" },
              { icon: Eye, title: "Per-request audit", desc: "Each captured URL classified by vendor, scanned for PII in query params, checked for HTTP/redirects/failures.", color: "text-emerald-400" },
            ].map((c, i) => (
              <div key={i} className="border border-zinc-900 bg-zinc-950 rounded-sm p-5">
                <c.icon className={`w-5 h-5 ${c.color} mb-3`} strokeWidth={1.5} />
                <h3 className="font-display text-base text-zinc-100 mb-1">{c.title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </section>
        )}

        <footer className="mt-16 pt-6 border-t border-zinc-900 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600 flex items-center justify-between flex-wrap gap-3">
          <span>◇ Playwright + headless Chrome · 8s capture window</span>
          <span>Built for ad-ops · Floodlight · CM360 · GTM</span>
        </footer>
      </main>
    </div>
  );
}
