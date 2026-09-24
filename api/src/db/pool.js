import pg from 'pg';
import { env } from '../config/env.js';

// One shared pool of connections for the whole app. Drizzle (Phase 1) will sit on top of it.
// max >= 2 matters later: the Seat Race needs two accepts in two separate transactions (#17).
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5_000, // Neon can take a few seconds to wake up (#27)
});

/** True if the database answers a trivial query. Used by GET /health. */
export async function isDatabaseUp() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
