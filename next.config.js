/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 14 syntax (under experimental). Next.js 15 uses top-level serverExternalPackages.
  experimental: {
    serverComponentsExternalPackages: [
      "@sparticuz/chromium",
      "playwright-core",
      "playwright",
    ],
  },

  // Belt-and-suspenders: explicitly tell webpack not to bundle these.
  // Sparticuz uses runtime path resolution to find its binary files, which breaks
  // when bundled. Marking them as external forces require() at runtime.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push(
        "@sparticuz/chromium",
        "playwright-core",
        "playwright"
      );
    }
    return config;
  },

  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
