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

// ---- The five steps of a trip, and where a booking status sits among them ----

export const STEPS = ['Requested', 'Matched', 'At the stand', 'On the way', 'Dropped off'];

export const STEP_OF_STATUS = { REQUESTED: 0, MATCHED: 1, DRIVER_ARRIVED: 2, IN_PROGRESS: 3, COMPLETED: 4 };

// ---- What each timeline event means to the passenger ----

export const EVENT_LABELS = {
  REQUESTED: 'You asked for a ride',
  REQUEST_MATCHED: 'A driver accepted your request',
  ARRIVED: 'Your Tesla reached the stand',
  BOARDED: 'You boarded',
  STARTED: 'The trip started',
  DROPPED: 'You were dropped off',
  RIDE_COMPLETED: 'The trip finished',
  CANCELLED: 'You cancelled',
  NO_SHOW: 'You were marked as a no-show',
  LEFT_BEHIND: 'The trip left without you, back to waiting',
  RIDE_CANCELLED: 'The driver cancelled the ride, back to waiting',
  RIDE_AUTO_CANCELLED: 'The ride was cancelled',
  RIDE_AUTO_CLOSED: 'The trip was closed automatically',
};

// ---- Remembering which receipt was dismissed, so it stays gone after a reload ----

const DISMISSED_KEY = 'seatase.dismissedReceipt';

export function readDismissedReceipt() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

export function writeDismissedReceipt(id) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, id);
  } catch {}
}
