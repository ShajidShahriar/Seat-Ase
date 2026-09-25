import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { TEST_DATABASE_URL } from './testDatabase.js';

const API_ROOT = fileURLToPath(new URL('../..', import.meta.url));

// ---- Create the test database on first run, then bring it to the latest schema with the base world ----

async function createDatabaseIfMissing() {
  const target = new URL(TEST_DATABASE_URL);
  const name = target.pathname.slice(1);
  const maintenance = new URL(TEST_DATABASE_URL);
  maintenance.pathname = '/postgres';

  const client = new pg.Client({ connectionString: maintenance.href });
  await client.connect();
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
  await client.end();
}

export default async function setup() {
  await createDatabaseIfMissing();
  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: 'test' };
  execFileSync('node', ['src/db/migrate.js'], { cwd: API_ROOT, env, stdio: 'inherit' });
  execFileSync('node', ['src/db/seed/dhaka.js'], { cwd: API_ROOT, env, stdio: 'inherit' });
}
