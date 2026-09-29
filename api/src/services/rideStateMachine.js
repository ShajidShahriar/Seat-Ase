import { AppError } from '../lib/AppError.js';

// ---- Who may move a ride or a booking from one status to another. Every status update in the services asks here first ----
// DRIVER and PASSENGER are people pressing buttons; SYSTEM is a rule acting on its own (a timer, or the last passenger leaving);
// DEMO is the Seat Race reset, the only thing allowed to end a trip that has already started.

export const RIDE_TRANSITIONS = {
  OPEN: { ARRIVED: ['DRIVER'], CANCELLED: ['DRIVER', 'SYSTEM', 'DEMO'] },
  ARRIVED: { STARTED: ['DRIVER'], CANCELLED: ['DRIVER', 'SYSTEM', 'DEMO'] },
  STARTED: { COMPLETED: ['DRIVER', 'SYSTEM'], CANCELLED: ['DEMO'] },
  COMPLETED: {},
  CANCELLED: {},
};

export const BOOKING_TRANSITIONS = {
  REQUESTED: { MATCHED: ['DRIVER'], CANCELLED: ['PASSENGER', 'DEMO'], EXPIRED: ['SYSTEM'] },
  MATCHED: { DRIVER_ARRIVED: ['DRIVER'], REQUESTED: ['DRIVER', 'SYSTEM'], CANCELLED: ['PASSENGER', 'DEMO'] },
  DRIVER_ARRIVED: { IN_PROGRESS: ['DRIVER'], NO_SHOW: ['DRIVER'], REQUESTED: ['DRIVER'], CANCELLED: ['PASSENGER', 'DEMO'] },
  IN_PROGRESS: { COMPLETED: ['DRIVER', 'SYSTEM'], CANCELLED: ['DEMO'] },
  COMPLETED: {},
  CANCELLED: {},
  EXPIRED: {},
  NO_SHOW: {},
};

export function canTransitionRide(from, to, actor) {
  return RIDE_TRANSITIONS[from]?.[to]?.includes(actor) ?? false;
}

export function canTransitionBooking(from, to, actor) {
  return BOOKING_TRANSITIONS[from]?.[to]?.includes(actor) ?? false;
}

export function assertRideTransition(from, to, actor) {
  if (!canTransitionRide(from, to, actor)) {
    throw new AppError(409, 'INVALID_TRANSITION', `A ride cannot go from ${from} to ${to} (${actor.toLowerCase()}).`);
  }
}

export function assertBookingTransition(from, to, actor) {
  if (!canTransitionBooking(from, to, actor)) {
    throw new AppError(409, 'INVALID_TRANSITION', `A booking cannot go from ${from} to ${to} (${actor.toLowerCase()}).`);
  }
}
