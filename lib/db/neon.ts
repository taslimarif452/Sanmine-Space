import { neon } from "@neondatabase/serverless";

const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  process.env.NEON_DATABASE_URL?.trim();

if (!databaseUrl) {
  console.warn("Database URL is not configured; Neon persistence is unavailable.");
}

// Keep module loading safe during Next.js builds. API routes report the missing
// configuration when a database operation is actually attempted.
export const sql = neon(databaseUrl || "postgresql://invalid:invalid@localhost/invalid");

export function hasDatabaseConfig() {
  return Boolean(databaseUrl);
}
