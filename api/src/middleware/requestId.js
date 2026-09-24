import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger.js';

/**
 * Gives every request an ID, a logger that stamps that ID on each line,
 * and one summary line when the response finishes. Bodies are never logged.
 */
export function requestId(req, res, next) {
  req.id = randomUUID();
  req.log = logger.child({ requestId: req.id });
  res.setHeader('X-Request-Id', req.id);

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    req.log.http('request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Math.round(ms),
    });
  });

  next();
}
