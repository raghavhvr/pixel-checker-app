/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Don't bundle these into the serverless function output (they're huge).
    // Vercel's @sparticuz/chromium loader needs to access them as plain files.
    serverComponentsExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  },
  // Avoid linting blocking the build during deploy iteration
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
