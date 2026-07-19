import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required. Copy .env.example to .env.local before running database commands.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
