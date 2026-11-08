import type { NextConfig } from "next";

// Cache Components (the create-next-app default in Next 16.4) is deliberately off: every Inroad page is
// per-user and reads the session and database at request time, so the classic dynamic rendering model
// is simpler for everyone building on this app.
const nextConfig: NextConfig = {
  // The e2e suite (playwright.config.ts sets INROAD_E2E=1) runs on `next dev`; the dev-tools button would be
  // the first tab stop and sit inside axe's scans, so it is hidden there only.
  ...(process.env.INROAD_E2E === "1" ? { devIndicators: false as const } : {}),
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
  experimental: {
    serverActions: {
      // Server Actions reject bodies over 1 MB by default, which includes multipart overhead. Resume uploads
      // allow up to 5 MB (src/lib/resume/constants.ts) and CSV imports up to 1 MB; the actions enforce those
      // limits themselves, so this only needs headroom above the largest one.
      bodySizeLimit: "6mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
