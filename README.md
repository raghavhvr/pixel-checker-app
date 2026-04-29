# PIXEL/CHECK — Runtime Floodlight & Piggyback Auditor

Fires CM360 Floodlight tags inside headless Chrome and captures every network request that results — including piggybacks injected by the ad-server at fire time. Each captured request is then audited for safety (PII in URLs, non-TLS, unrecognized vendors, redirects, failures).

This is the **runtime** version. Static analysis can't see piggybacks because they're configured in CM360's Tag Manager tab and only materialize when the tag actually fires.

## How it works

1. User pastes a Floodlight tag.
2. Vercel serverless function spins up headless Chrome via `@sparticuz/chromium` + `playwright-core`.
3. Function injects the tag into a sandbox HTML page and lets it fire.
4. Every network request is captured for ~8 seconds.
5. Each request is classified (Floodlight vs piggyback), matched against a vendor allowlist, and scanned for PII / HTTP / failures.
6. Results stream back to the UI.

## Local development

```bash
npm install
# Playwright pulls its own Chromium for local dev (Sparticuz is for serverless only)
npx playwright install chromium

npm run dev
# Open http://localhost:3000
```

## Deploy to Vercel

```bash
# Install Vercel CLI if you don't have it
npm i -g vercel

# From the project root
vercel deploy
# Or push to a Git repo connected to Vercel — auto-deploys
```

### Vercel notes

- **Function size**: Sparticuz Chromium is ~50MB compressed. Vercel's serverless function limit is 250MB unzipped on Hobby, 250MB on Pro. This fits.
- **Memory**: Set to 1024MB in `vercel.json`. Headless Chrome needs the headroom.
- **Duration**: Set to 60s in `vercel.json`. The audit window is 8s but cold starts can take 5–10s additional. **60s requires a Pro plan**; on Hobby you're capped at 10s and this won't work — upgrade or self-host.
- **Region**: Default is fine. If you're auditing region-specific tags (e.g., EU consent flows), set the function region to `fra1` or `iad1` accordingly.

## Limitations

- **Single tag per request.** Could be extended to batch.
- **No user interaction.** Tags that require a click/form submit to fire won't fire here. Page View Floodlights work; conversion Floodlights triggered by GTM events won't.
- **No consent context.** Real users may have OneTrust / TCF strings that suppress some piggybacks. This sandbox has no consent state, so you'll see the maximum-fire scenario.
- **8-second capture window.** Slow piggybacks past 8s won't be caught. Tunable in `app/api/audit/route.js`.
- **Vendor allowlist is hardcoded** in `lib/vendors.js`. Add new vendors as they show up.

## File structure

```
pixel-checker/
├── app/
│   ├── api/
│   │   └── audit/route.js     # Playwright endpoint
│   ├── layout.jsx
│   ├── page.jsx               # Main UI
│   └── globals.css
├── lib/
│   └── vendors.js             # Vendor allowlist + audit rules
├── package.json
├── next.config.js
├── tailwind.config.js
├── vercel.json
└── README.md
```

## Extending

- **Add vendors**: edit `KNOWN_VENDORS` in `lib/vendors.js`.
- **Add audit rules**: edit `auditRequest()` in `lib/vendors.js` — new findings get picked up by the UI automatically.
- **Persist audits**: add a database (Vercel Postgres, Supabase) and write to it from `route.js`.
- **Auth**: wrap with Clerk or Auth.js — don't ship this open to the internet, headless browser endpoints get abused.
- **Rate limit**: Upstash Redis + `@upstash/ratelimit` is one file.
