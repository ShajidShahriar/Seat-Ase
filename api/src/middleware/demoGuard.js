import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError } from '../lib/AppError.js';
import { env } from '../config/env.js';

// ---- Hash first so both sides are the same length, then compare in constant time ----

function sameKey(given, expected) {
  const a = createHash('sha256').update(String(given ?? '')).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

// ---- The /dev routes do not exist unless demo mode is on and a key is set; with them on, the key must match ----

export function createDemoGuard(config = env) {
  return (req, res, next) => {
    if (!config.DEMO_MODE || !config.DEMO_KEY) {
      return next(new AppError(404, 'NOT_FOUND', 'Not found.'));
    }
    if (!sameKey(req.get('X-Demo-Key'), config.DEMO_KEY)) {
      return next(new AppError(401, 'DEMO_KEY_REQUIRED', 'A valid X-Demo-Key header is required.'));
    }
    next();
  };
}
