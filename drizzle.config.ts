import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile();
} catch {
  // No .env file: DATABASE_URL comes from the environment.
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
