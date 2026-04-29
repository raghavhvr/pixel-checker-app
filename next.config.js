/** @type {import('next').NextConfig} */
const nextConfig = {
  // CRITICAL: Mark Sparticuz Chromium and Playwright as external packages so
  // Next.js doesn't try to bundle them. Sparticuz uses relative path resolution
  // for its binary files, which breaks if bundled.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core", "playwright"],

  // Required by Sparticuz when running on Vercel — it expects standalone output mode
  // for proper file tracing of the chromium binary.
  output: "standalone",

  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
