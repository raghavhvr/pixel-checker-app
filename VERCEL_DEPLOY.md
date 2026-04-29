# VERCEL DEPLOYMENT GUIDE

If you hit the `libnss3.so: cannot open shared object file` or `Target page, context or browser has been closed` error on Vercel, **the code isn't the problem** — it's the Vercel project configuration. Follow these steps in order.

## Step 1 — Verify package versions

The Sparticuz Chromium version must match a Chromium release that Playwright supports. Versions in this repo's `package.json`:

```json
"@sparticuz/chromium": "^131.0.0",
"playwright-core": "^1.48.0"
```

These are paired correctly. **Don't bump one without bumping the other** — you'll get exactly the libnss3 error if they desync.

If you need a newer version, check https://github.com/Sparticuz/chromium/releases for the supported Playwright/Puppeteer version of any given release.

## Step 2 — Disable Fluid Compute (CRITICAL)

This is the most common cause of your specific error. Vercel's "Fluid Compute" feature changes the function runtime in a way that breaks Sparticuz Chromium.

1. Go to your Vercel project
2. **Settings** → **Functions**
3. Find **Fluid Compute** (or "Fluid")
4. **Toggle it OFF**
5. Redeploy

When Fluid Compute is on, you'll see exactly the error you reported:
```
browserType.launch: Target page, context or browser has been closed
[pid=51][err] /tmp/chromium: error while loading shared libraries: libnss3.so
```

## Step 3 — Confirm function memory and duration

In **Settings** → **Functions**:

- **Memory**: 1024 MB minimum (set in `vercel.json`, but verify it's applied)
- **Max Duration**: 60 seconds (requires Pro plan)

If you're on Hobby tier, max duration is capped at 10s. The audit will time out before Sparticuz can extract Chromium from `/tmp/chromium-pack` on cold start. **You must upgrade to Pro for this to work reliably**, OR reduce `CAPTURE_WINDOW_MS` to 4000 in the route — but then you'll miss slow piggybacks.

## Step 4 — Verify Node.js runtime version

In **Settings** → **General** → **Node.js Version**:

- Set to **20.x** (current LTS as of 2026)

Sparticuz no longer supports Node 14, and Node 18 is past EOL. Use 20.

## Step 5 — Verify region

In **Settings** → **Functions** → **Function Region**:

- Pick a region close to where your Floodlight server lives (usually `iad1` for US, `fra1` for EU)
- Sparticuz works on all Vercel regions

## Step 6 — Redeploy

After making the above changes, force a fresh deploy:

```bash
vercel --prod --force
```

Or trigger a fresh deploy from the dashboard. Old function builds may still have cached config.

## Step 7 — Test

Hit `/api/audit` directly with `GET` first to confirm the route is reachable:

```bash
curl https://YOUR-DEPLOYMENT.vercel.app/api/audit
# Should return: {"ok": true, "info": "...", "runtime": "vercel-serverless"}
```

If you get `runtime: "local"` in production, something is wrong with the env detection — `process.env.VERCEL` should be set automatically by Vercel.

Then test the actual audit:

```bash
curl -X POST https://YOUR-DEPLOYMENT.vercel.app/api/audit \
  -H "Content-Type: application/json" \
  -d '{"tagCode":"<script>document.write(\"<iframe src=\\\"https://6789.fls.doubleclick.net/activityi;src=6789;type=conv0;cat=signu0;ord=1?\\\" width=\\\"1\\\" height=\\\"1\\\"></iframe>\");</script>"}'
```

## Still failing?

If after all of the above you still get the libnss3 error, **switch to Docker**. The included `Dockerfile` uses Microsoft's official Playwright image which has every system library pre-installed. Deploy the container to:

- **Railway** — `railway up` from the project root, auto-detects the Dockerfile
- **Fly.io** — `fly launch` and `fly deploy`
- **Render** — connect the repo, choose "Web Service from Dockerfile"
- **Google Cloud Run** — `gcloud run deploy --source .`

Same UX, no Vercel/Sparticuz fragility.

## Why this is so brittle

Vercel + Chromium is one of the most cursed deployment combos in serverless. Every six months the platform changes something (Edge runtime, Fluid Compute, function size limits, Node version defaults) and the existing Sparticuz patterns break. Docker is more verbose to set up but immune to all of this — you control the entire runtime.

For a tool you'll actually use day-to-day, I'd recommend the Docker path on Railway or Fly.io. ~$5/mo, no fights.
