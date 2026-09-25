import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { pool } from './db/pool.js';
import { closeAllConnections } from './realtime/notify.js';

const server = app.listen(env.PORT, () => {
  logger.info(`Seat Ase? API listening on :${env.PORT}`, { env: env.NODE_ENV });
});

// Render and Docker stop containers with SIGTERM: finish in-flight requests, then close DB connections.
function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  closeAllConnections();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
