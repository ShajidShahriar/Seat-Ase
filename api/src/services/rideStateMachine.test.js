import { describe, it, expect } from 'vitest';
import { canTransitionRide, canTransitionBooking, assertRideTransition } from './rideStateMachine.js';

describe('ride transitions', () => {
  it.each([
    ['OPEN', 'ARRIVED', 'DRIVER', true],
    ['OPEN', 'CANCELLED', 'DRIVER', true],
    ['OPEN', 'CANCELLED', 'SYSTEM', true],
    ['ARRIVED', 'STARTED', 'DRIVER', true],
    ['ARRIVED', 'CANCELLED', 'SYSTEM', true],
    ['STARTED', 'COMPLETED', 'DRIVER', true],
    ['STARTED', 'COMPLETED', 'SYSTEM', true],
    ['STARTED', 'CANCELLED', 'DEMO', true],
    ['OPEN', 'ARRIVED', 'PASSENGER', false],
    ['ARRIVED', 'STARTED', 'SYSTEM', false],
    ['STARTED', 'CANCELLED', 'DRIVER', false],
    ['OPEN', 'STARTED', 'DRIVER', false],
    ['OPEN', 'COMPLETED', 'SYSTEM', false],
    ['ARRIVED', 'OPEN', 'DRIVER', false],
    ['COMPLETED', 'OPEN', 'SYSTEM', false],
    ['CANCELLED', 'OPEN', 'DRIVER', false],
  ])('%s -> %s by %s is %s', (from, to, actor, expected) => {
    expect(canTransitionRide(from, to, actor)).toBe(expected);
  });
});

describe('booking transitions', () => {
  it.each([
    ['REQUESTED', 'MATCHED', 'DRIVER', true],
    ['REQUESTED', 'CANCELLED', 'PASSENGER', true],
    ['REQUESTED', 'EXPIRED', 'SYSTEM', true],
    ['MATCHED', 'DRIVER_ARRIVED', 'DRIVER', true],
    ['MATCHED', 'CANCELLED', 'PASSENGER', true],
    ['MATCHED', 'REQUESTED', 'DRIVER', true],
    ['MATCHED', 'REQUESTED', 'SYSTEM', true],
    ['DRIVER_ARRIVED', 'IN_PROGRESS', 'DRIVER', true],
    ['DRIVER_ARRIVED', 'NO_SHOW', 'DRIVER', true],
    ['DRIVER_ARRIVED', 'REQUESTED', 'DRIVER', true],
    ['DRIVER_ARRIVED', 'CANCELLED', 'PASSENGER', true],
    ['IN_PROGRESS', 'COMPLETED', 'DRIVER', true],
    ['IN_PROGRESS', 'COMPLETED', 'SYSTEM', true],
    ['IN_PROGRESS', 'CANCELLED', 'DEMO', true],
    ['REQUESTED', 'MATCHED', 'PASSENGER', false],
    ['REQUESTED', 'EXPIRED', 'DRIVER', false],
    ['DRIVER_ARRIVED', 'NO_SHOW', 'PASSENGER', false],
    ['IN_PROGRESS', 'CANCELLED', 'PASSENGER', false],
    ['IN_PROGRESS', 'CANCELLED', 'DRIVER', false],
    ['REQUESTED', 'IN_PROGRESS', 'DRIVER', false],
    ['REQUESTED', 'DRIVER_ARRIVED', 'DRIVER', false],
    ['MATCHED', 'IN_PROGRESS', 'DRIVER', false],
    ['MATCHED', 'COMPLETED', 'DRIVER', false],
    ['DRIVER_ARRIVED', 'MATCHED', 'DRIVER', false],
    ['COMPLETED', 'CANCELLED', 'DEMO', false],
    ['NO_SHOW', 'MATCHED', 'DRIVER', false],
  ])('%s -> %s by %s is %s', (from, to, actor, expected) => {
    expect(canTransitionBooking(from, to, actor)).toBe(expected);
  });
});

describe('assertRideTransition', () => {
  it('throws a 409 INVALID_TRANSITION for a jump the table forbids', () => {
    expect(() => assertRideTransition('OPEN', 'STARTED', 'DRIVER')).toThrow(expect.objectContaining({ status: 409, code: 'INVALID_TRANSITION' }));
  });
});
