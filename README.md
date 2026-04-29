# PIXEL/CHECK — Runtime Floodlight & Piggyback Auditor

Fires CM360 Floodlight tags inside headless Chrome and captures every network request that results — including piggybacks injected by the ad-server at fire time. Each captured request is then audited for safety (PII in URLs, non-TLS, unrecognized vendors, redirects, failures).

This is the **runtime** version. Static analysis can't see piggybacks because they're configured in CM360's Tag Manager tab and only materialize when the tag actually fires.

## How it works

1. User pastes a Floodlight tag.
2. Server-side function spins up headless Chrome.
3. Function injects the tag into a sandbox HTML page and lets it fire.
4. Every network request is captured for ~8 seconds.
5. Each request is classified (Floodlight vs piggyback), matched against a vendor allowlist, and scanned for PII / HTTP / failures.
6. Results stream back to the UI.

## Deploy options

The audit endpoint launches a real Chromium browser. This means **system libraries** matter — Chromium needs `libnss3`, `libatk1.0-0`, etc. Three deploy paths solve this:

### Option A — Vercel (easiest, requires Pro plan)

```bash
npm i -g vercel
vercel deploy
```

Uses `@sparticuz/chromium`, a Chromium build optimized for AWS Lambda. The route auto-detects `process.env.VERCEL` and uses the right binary. **Requires Vercel Pro** for the 60s `maxDuration` — Hobby caps you at 10s, which isn't enough for cold start + audit window.

### Option B — Docker (recommended for self-hosting)

The included `Dockerfile` uses Microsoft's official Playwright image, which has every Chromium dep pre-installed. Build and run anywhere:

```bash
docker build -t pixel-checker .
docker run -p 3000:3000 pixel-checker
```

Deploy that container to Railway, Fly.io, Render, AWS ECS, GCP Cloud Run, etc. No system-library fighting.

### Option C — Local dev / bare Linux

```bash
npm install
# Install Chromium AND its system deps. Requires sudo for the deps.
npx playwright install --with-deps chromium

npm run dev
# Open http://localhost:3000
```

If `--with-deps` fails (e.g., on RHEL/Amazon Linux), install manually:

```bash
# Debian/Ubuntu
sudo apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2

# Then install Chromium without deps
npx playwright install chromium
```

## Troubleshooting

### `error while loading shared libraries: libnss3.so`

You're running the audit endpoint on a Linux environment that doesn't have Chromium's required system libraries. Three fixes:

1. **Use Docker.** The `Dockerfile` solves this. Easiest path.
2. **Install deps manually.** `sudo apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2`
3. **Use a different host.** Vercel, Railway with Nixpacks, and Fly.io with the Playwright image handle this for you.

### `Audit failed — Target page, context or browser has been closed`

Usually a downstream symptom of the libnss3 error above. Check the `detail` field in the API response.

### `Function exceeded maximum duration`

You're on Vercel Hobby (10s cap). Either upgrade to Pro, or reduce `CAPTURE_WINDOW_MS` in `app/api/audit/route.js` to 4000ms. Quality of results will degrade — slow piggybacks won't be caught.

## Limitations

- **One tag per request.** Could be batched.
- **No user interaction.** Tags requiring a click/form submit to fire won't fire here. Page View Floodlights work; click-triggered conversions don't.
- **No consent context.** Real users may have OneTrust / TCF strings that suppress some piggybacks. Sandbox has no consent state, so you'll see the maximum-fire scenario.
- **8-second capture window.** Tunable in `app/api/audit/route.js`.
- **Vendor allowlist hardcoded** in `lib/vendors.js`.

## File structure

```
pixel-checker/
├── app/
│   ├── api/audit/route.js     # Playwright endpoint
│   ├── layout.jsx
│   ├── page.jsx               # Main UI
│   └── globals.css
├── lib/
│   └── vendors.js             # Vendor allowlist + audit rules
├── Dockerfile                 # For container deploys
├── package.json
├── next.config.js
├── tailwind.config.js
├── vercel.json
└── README.md
```

## Production hardening (do before public deploy)

- **Auth.** Wrap with Clerk or Auth.js. Open headless-browser endpoints get abused.
- **Rate limit.** Upstash Redis + `@upstash/ratelimit`, one file.
- **Persistence.** Vercel Postgres or Supabase to log audits and re-run them later.
- **URL allowlist.** If you only audit your own org's tags, validate the input contains expected Floodlight account IDs.
