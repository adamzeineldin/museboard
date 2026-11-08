import type { NextConfig } from "next";

// Cache Components (the create-next-app default in Next 16.4) is deliberately off: every Inroad page is
// per-user and reads the session and database at request time, so the classic dynamic rendering model
// is simpler for everyone building on this app.
const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
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
