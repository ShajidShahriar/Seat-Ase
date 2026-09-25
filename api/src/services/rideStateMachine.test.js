import { describe, it, expect } from 'vitest';
import { canTransitionRide, canTransitionBooking } from './rideStateMachine.js';

describe('ride transitions', () => {
  it.each([
    ['OPEN', 'ARRIVED', true],
    ['OPEN', 'CANCELLED', true],
    ['ARRIVED', 'STARTED', true],
    ['ARRIVED', 'CANCELLED', true],
    ['STARTED', 'COMPLETED', true],
    ['OPEN', 'STARTED', false],
    ['OPEN', 'COMPLETED', false],
    ['ARRIVED', 'OPEN', false],
    ['COMPLETED', 'OPEN', false],
    ['CANCELLED', 'OPEN', false],
  ])('%s -> %s is %s', (from, to, expected) => {
    expect(canTransitionRide(from, to)).toBe(expected);
  });
});

describe('booking transitions', () => {
  it.each([
    ['REQUESTED', 'MATCHED', true],
    ['REQUESTED', 'CANCELLED', true],
    ['REQUESTED', 'EXPIRED', true],
    ['MATCHED', 'DRIVER_ARRIVED', true],
    ['MATCHED', 'CANCELLED', true],
    ['MATCHED', 'REQUESTED', true],
    ['DRIVER_ARRIVED', 'IN_PROGRESS', true],
    ['DRIVER_ARRIVED', 'NO_SHOW', true],
    ['DRIVER_ARRIVED', 'REQUESTED', true],
    ['DRIVER_ARRIVED', 'CANCELLED', true],
    ['IN_PROGRESS', 'COMPLETED', true],
    ['REQUESTED', 'IN_PROGRESS', false],
    ['REQUESTED', 'DRIVER_ARRIVED', false],
    ['MATCHED', 'IN_PROGRESS', false],
    ['MATCHED', 'COMPLETED', false],
    ['DRIVER_ARRIVED', 'MATCHED', false],
    ['COMPLETED', 'CANCELLED', false],
    ['NO_SHOW', 'MATCHED', false],
  ])('%s -> %s is %s', (from, to, expected) => {
    expect(canTransitionBooking(from, to)).toBe(expected);
  });
});
