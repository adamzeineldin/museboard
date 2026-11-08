import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer reads the datasource URL from schema.prisma or loads .env by itself.
// DATABASE_URL defaults to the local SQLite file so `prisma generate` works on a fresh clone.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
});
