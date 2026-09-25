import { createHmac } from 'node:crypto';
import { env } from '../config/env.js';

// ---- One NID, one account: the fingerprint must never depend on a secret that gets rotated ----

export function hashNid(nid, config = env) {
  return createHmac('sha256', config.NID_PEPPER).update(nid).digest('hex');
}

export function last4(nid) {
  return nid.slice(-4);
}
