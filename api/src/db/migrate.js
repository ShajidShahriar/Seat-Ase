import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { db } from './client.js';
import { pool } from './pool.js';
import { logger } from '../lib/logger.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

async function main() {
  logger.info('running migrations', { migrationsFolder });
  await migrate(db, { migrationsFolder });
  logger.info('migrations complete');
  await pool.end();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    logger.error('migration failed', { error: err.message });
    process.exit(1);
  });
}
