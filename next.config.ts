import type { NextConfig } from "next";

// Cache Components (the create-next-app default in Next 16.4) is deliberately off: every Inroad page is
// per-user and reads the session and database at request time, so the classic dynamic rendering model
// is simpler for everyone building on this app.
const nextConfig: NextConfig = {
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
