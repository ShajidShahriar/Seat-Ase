// ---- The passenger's booking statuses, in plain words ----

export const ACTIVE_STATUSES = ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'IN_PROGRESS'];

export const STATUS_TITLES = {
  REQUESTED: 'Looking for a Tesla',
  MATCHED: 'A Tesla is on the way',
  DRIVER_ARRIVED: 'Your Tesla is at the stand',
  IN_PROGRESS: 'On your way',
};

// ---- One key per attempt: a retry of the same request reuses it, a changed request gets a new one ----

export function newIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
