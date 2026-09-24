import winston from 'winston';
import { env } from '../config/env.js';

// Red-team #37: anything under these keys is replaced before a log line is written,
// however deeply it is nested. Error codes are logged as `errorCode`, never `code`.
const SECRET_KEYS = new Set(['password', 'code', 'nid', 'otp', 'token', 'cookie', 'authorization']);

function redact(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));
  const copy = {};
  for (const [key, inner] of Object.entries(value)) {
    copy[key] = SECRET_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(inner, seen);
  }
  return copy;
}

const redactSecrets = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (SECRET_KEYS.has(key.toLowerCase())) info[key] = '[redacted]';
    else info[key] = redact(info[key]);
  }
  return info;
});

// JSON in production so logs can be searched by requestId; readable lines on a laptop.
const output =
  env.NODE_ENV === 'production'
    ? winston.format.json()
    : winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} ${level}: ${message}${extra}`;
      });

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  silent: env.NODE_ENV === 'test',
  format: winston.format.combine(winston.format.timestamp(), redactSecrets(), output),
  transports: [new winston.transports.Console()],
});

export { redact };
