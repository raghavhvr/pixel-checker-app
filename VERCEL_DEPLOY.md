# VERCEL DEPLOYMENT — REQUIRED STEPS

If you've hit `libnss3.so: cannot open shared object file` on Vercel after a successful build, the code is fine. The fix is **two environment configurations** that the basic Sparticuz docs don't mention. Do all of these in order.

## Step 1 — Set the runtime env var in Vercel Dashboard (CRITICAL)

This is the actual fix for the libnss3 error.

1. Go to **Vercel → your project → Settings → Environment Variables**
2. Click **Add new**
3. Set:
   - **Name**: `AWS_LAMBDA_JS_RUNTIME`
   - **Value**: `nodejs20.x`
   - **Environments**: check **Production**, **Preview**, **Development**
4. Save

**Why this matters**: Sparticuz Chromium checks `process.env.AWS_LAMBDA_JS_RUNTIME` at module-import time to decide which Chromium binary variant to extract. If the env var isn't set, it picks the wrong variant whose libraries aren't compatible with Vercel's Node 20 runtime — hence the missing libnss3.

You can't set this in your `.js` code because the Sparticuz module imports before your code runs. **It must be set in the Dashboard.**

## Step 2 — Disable Fluid Compute

1. **Settings → Functions** (or "Compute" in newer Vercel UI)
2. Find **Fluid Compute** (sometimes labeled just "Fluid")
3. Toggle **OFF**

Fluid Compute changes the function runtime in a way that breaks Sparticuz's `/tmp/chromium` extraction. There are multiple Vercel community threads confirming this. Until Vercel and Sparticuz reconcile this, leave it off.

## Step 3 — Confirm function memory and plan

- **Memory**: 1024MB (set in `vercel.json`, but verify in Dashboard)
- **Plan**: Pro required for the 60s `maxDuration`. On Hobby (10s cap), Sparticuz can't finish extracting Chromium before the function times out — which manifests as the same libnss3 error on next invocation.

## Step 4 — Force a fresh deploy

Env var changes don't apply to existing function deployments. You must redeploy:

```bash
vercel --prod --force
```

Or push a new commit to trigger a fresh build. Or in the Dashboard: Deployments → ⋯ on the latest deploy → **Redeploy**.

## Step 5 — Verify it worked

```bash
curl https://YOUR-DEPLOYMENT.vercel.app/api/audit
```

You should see:
```json
{
  "ok": true,
  "info": "...",
  "runtime": "vercel-serverless",
  "env": {
    "VERCEL": true,
    "AWS_LAMBDA_JS_RUNTIME": "nodejs20.x"
  }
}
```

If `AWS_LAMBDA_JS_RUNTIME` shows `(not set)`, Step 1 didn't take effect. Re-check the Dashboard, and make sure you redeployed after adding the env var.

Then test the actual audit endpoint with a Floodlight tag (use the UI or POST directly).

## If it STILL fails after all of this

You've hit the wall. Vercel + Sparticuz is genuinely fragile, and any of the following can re-break it without warning:

- Vercel platform updates that change the Lambda runtime
- Sparticuz version mismatches with Playwright
- Hobby/Pro plan policy changes
- Node version changes

**Switch to Docker.** The included `Dockerfile` uses Microsoft's official Playwright image with all dependencies pre-installed. Deploy to:

- **Railway** — fastest setup. `npm i -g @railway/cli && railway login && railway up`. ~$5/mo.
- **Fly.io** — `fly launch && fly deploy`. ~$2-5/mo.
- **Render** — connect Git repo, choose "Web Service from Dockerfile".
- **Google Cloud Run** — `gcloud run deploy --source .`. Generous free tier.

Same code, no Vercel-specific fragility. You control the entire runtime.

## Why I'm being so blunt about this

I've now sent you four versions of this app trying to make Vercel work. Each version fixes a real Vercel-specific issue, but the platform keeps throwing new ones. That's not a code problem — it's a fundamental mismatch between Vercel's serverless model and the practical needs of running headless Chromium.

Docker on Railway/Fly is genuinely the right answer for a tool you'll use day-to-day. The setup is 10 minutes and then the brittleness goes away.
