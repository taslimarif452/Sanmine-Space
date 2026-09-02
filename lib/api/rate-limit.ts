import { sql } from "@/lib/db/neon";
import { AppError } from "@/lib/api/errors";

export async function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = new Date(now);
  const windowStart = new Date(now - (now % windowMs));
  const rows = await sql`
    INSERT INTO rate_limit_buckets(key, window_started_at, count, updated_at)
    VALUES (${key}, ${windowStart.toISOString()}, 1, ${current.toISOString()})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit_buckets.window_started_at < ${windowStart.toISOString()}::timestamptz THEN 1 ELSE rate_limit_buckets.count + 1 END,
      window_started_at = CASE WHEN rate_limit_buckets.window_started_at < ${windowStart.toISOString()}::timestamptz THEN ${windowStart.toISOString()}::timestamptz ELSE rate_limit_buckets.window_started_at END,
      updated_at = ${current.toISOString()}
    RETURNING count, window_started_at
  `;
  const row = rows[0] as { count: number; window_started_at: string } | undefined;
  if (!row || Number(row.count) > limit) {
    const retryAfter = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000));
    throw new AppError("RATE_LIMITED", `Rate limit exceeded. Try again in ${retryAfter} seconds.`, 429);
  }
}
