import { createHmac } from 'node:crypto';
import { env } from '../config/env.js';

export function hashNid(nid) {
  return createHmac('sha256', env.JWT_SECRET).update(nid).digest('hex');
}

export function last4(nid) {
  return nid.slice(-4);
}
