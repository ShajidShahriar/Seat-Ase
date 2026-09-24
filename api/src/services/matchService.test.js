import { describe, it, expect } from 'vitest';
import { checkFit } from './matchService.js';

const BANANI_STAND = 'banani-stand';
const OTHER_STAND = 'other-stand';
const MOHAKHALI = 'mohakhali-zone';
const GULSHAN1 = 'gulshan1-zone';
const TEJGAON = 'tejgaon-zone';
const DHANMONDI = 'dhanmondi-zone';

const KM = {
  [`${MOHAKHALI}|${GULSHAN1}`]: 2.5,
  [`${GULSHAN1}|${MOHAKHALI}`]: 2.5,
  [`${MOHAKHALI}|${TEJGAON}`]: 2.0,
  [`${TEJGAON}|${MOHAKHALI}`]: 2.0,
  [`${GULSHAN1}|${TEJGAON}`]: 3.0,
  [`${TEJGAON}|${GULSHAN1}`]: 3.0,
  [`${GULSHAN1}|${DHANMONDI}`]: 8.0,
  [`${DHANMONDI}|${GULSHAN1}`]: 8.0,
};

function zoneDistanceKm(a, b) {
  if (a === b) return 0;
  return KM[`${a}|${b}`];
}

function nusrat(overrides = {}) {
  return {
    pickupStandId: BANANI_STAND,
    dropZoneId: MOHAKHALI,
    seats: 1,
    rideType: 'SHARED',
    womenOnly: false,
    gender: 'FEMALE',
    ...overrides,
  };
}

function rafiq(overrides = {}) {
  return {
    pickupStandId: BANANI_STAND,
    dropZoneId: GULSHAN1,
    seats: 1,
    rideType: 'SHARED',
    womenOnly: false,
    gender: 'MALE',
    ...overrides,
  };
}

function shirin(overrides = {}) {
  return {
    pickupStandId: BANANI_STAND,
    dropZoneId: MOHAKHALI,
    seats: 1,
    rideType: 'SHARED',
    womenOnly: true,
    gender: 'FEMALE',
    ...overrides,
  };
}

describe('Scenario A: the morning pool', () => {
  it('Nusrat fits an empty Bullet (first accept)', () => {
    const result = checkFit({ ride: null, activeBookings: [], candidate: nusrat(), zoneDistanceKm });
    expect(result.fits).toBe(true);
  });

  it("Rafiq fits after Nusrat (same stand, Gulshan 1 is 2.5km from Mohakhali)", () => {
    const ride = { status: 'OPEN', pickupStandId: BANANI_STAND, capacity: 3, seatsTaken: 1, isPrivate: false };
    const activeBookings = [{ dropZoneId: MOHAKHALI, gender: 'FEMALE', womenOnly: false }];
    const result = checkFit({ ride, activeBookings, candidate: rafiq(), zoneDistanceKm });
    expect(result.fits).toBe(true);
  });

  it("Shirin's women-only request does not fit once Rafiq (male) is aboard", () => {
    const ride = { status: 'OPEN', pickupStandId: BANANI_STAND, capacity: 3, seatsTaken: 2, isPrivate: false };
    const activeBookings = [
      { dropZoneId: MOHAKHALI, gender: 'FEMALE', womenOnly: false },
      { dropZoneId: GULSHAN1, gender: 'MALE', womenOnly: false },
    ];
    const result = checkFit({ ride, activeBookings, candidate: shirin(), zoneDistanceKm });
    expect(result.fits).toBe(false);
    expect(result.reasons.map((r) => r.rule)).toContain('R5');
  });

  it('a request to Dhanmondi (8km from Gulshan 1) does not fit', () => {
    const ride = { status: 'OPEN', pickupStandId: BANANI_STAND, capacity: 3, seatsTaken: 2, isPrivate: false };
    const activeBookings = [
      { dropZoneId: MOHAKHALI, gender: 'FEMALE', womenOnly: false },
      { dropZoneId: GULSHAN1, gender: 'MALE', womenOnly: false },
    ];
    const candidate = { pickupStandId: BANANI_STAND, dropZoneId: DHANMONDI, seats: 1, rideType: 'SHARED', womenOnly: false, gender: 'MALE' };
    const result = checkFit({ ride, activeBookings, candidate, zoneDistanceKm });
    expect(result.fits).toBe(false);
    expect(result.reasons.map((r) => r.rule)).toContain('R2');
  });

  it('a request from a different stand does not fit (R1)', () => {
    const ride = { status: 'OPEN', pickupStandId: BANANI_STAND, capacity: 3, seatsTaken: 1, isPrivate: false };
    const activeBookings = [{ dropZoneId: MOHAKHALI, gender: 'FEMALE', womenOnly: false }];
    const result = checkFit({ ride, activeBookings, candidate: rafiq({ pickupStandId: OTHER_STAND }), zoneDistanceKm });
    expect(result.fits).toBe(false);
    expect(result.reasons.map((r) => r.rule)).toContain('R1');
  });

  it('a ride that has already arrived accepts nobody new (R4)', () => {
    const ride = { status: 'ARRIVED', pickupStandId: BANANI_STAND, capacity: 3, seatsTaken: 1, isPrivate: false };
    const activeBookings = [{ dropZoneId: MOHAKHALI, gender: 'FEMALE', womenOnly: false }];
    const result = checkFit({ ride, activeBookings, candidate: rafiq(), zoneDistanceKm });
    expect(result.fits).toBe(false);
    expect(result.reasons.map((r) => r.rule)).toContain('R4');
  });
});

describe('Scenario E: three destinations from one stand', () => {
  it('Rafiq (Gulshan 1) fits after Nusrat (Mohakhali)', () => {
    const ride = { status: 'OPEN', pickupStandId: BANANI_STAND, capacity: 3, seatsTaken: 1, isPrivate: false };
    const activeBookings = [{ dropZoneId: MOHAKHALI, gender: 'FEMALE', womenOnly: false }];
    expect(checkFit({ ride, activeBookings, candidate: rafiq(), zoneDistanceKm }).fits).toBe(true);
  });

  it('Shirin to Tejgaon fits after Nusrat and Rafiq (2.0km and 3.0km away respectively)', () => {
    const ride = { status: 'OPEN', pickupStandId: BANANI_STAND, capacity: 3, seatsTaken: 2, isPrivate: false };
    const activeBookings = [
      { dropZoneId: MOHAKHALI, gender: 'FEMALE', womenOnly: false },
      { dropZoneId: GULSHAN1, gender: 'MALE', womenOnly: false },
    ];
    const candidate = { pickupStandId: BANANI_STAND, dropZoneId: TEJGAON, seats: 1, rideType: 'SHARED', womenOnly: false, gender: 'FEMALE' };
    expect(checkFit({ ride, activeBookings, candidate, zoneDistanceKm }).fits).toBe(true);
  });

  it('a 4th seat request does not fit a full 3-seat Bullet (R3)', () => {
    const ride = { status: 'OPEN', pickupStandId: BANANI_STAND, capacity: 3, seatsTaken: 3, isPrivate: false };
    const activeBookings = [
      { dropZoneId: MOHAKHALI, gender: 'FEMALE', womenOnly: false },
      { dropZoneId: GULSHAN1, gender: 'MALE', womenOnly: false },
      { dropZoneId: TEJGAON, gender: 'FEMALE', womenOnly: false },
    ];
    const result = checkFit({ ride, activeBookings, candidate: nusrat(), zoneDistanceKm });
    expect(result.fits).toBe(false);
    expect(result.reasons.map((r) => r.rule)).toContain('R3');
  });
});

describe('Women-only, every row of the design table', () => {
  it('an empty ride: women-only request fits', () => {
    expect(checkFit({ ride: null, activeBookings: [], candidate: shirin(), zoneDistanceKm }).fits).toBe(true);
  });

  it('Nusrat + another woman (neither women-only) + Shirin women-only: fits, everyone is female', () => {
    const ride = { status: 'OPEN', pickupStandId: BANANI_STAND, capacity: 3, seatsTaken: 2, isPrivate: false };
    const activeBookings = [
      { dropZoneId: MOHAKHALI, gender: 'FEMALE', womenOnly: false },
      { dropZoneId: MOHAKHALI, gender: 'FEMALE', womenOnly: false },
    ];
    expect(checkFit({ ride, activeBookings, candidate: shirin(), zoneDistanceKm }).fits).toBe(true);
  });

  it('Shirin (women-only) already aboard: Rafiq does not fit', () => {
    const ride = { status: 'OPEN', pickupStandId: BANANI_STAND, capacity: 3, seatsTaken: 1, isPrivate: false };
    const activeBookings = [{ dropZoneId: MOHAKHALI, gender: 'FEMALE', womenOnly: true }];
    const result = checkFit({ ride, activeBookings, candidate: rafiq(), zoneDistanceKm });
    expect(result.fits).toBe(false);
    expect(result.reasons.map((r) => r.rule)).toContain('R5');
  });

  it("Shirin (women-only) already aboard: Nusrat (didn't ask, but female) fits", () => {
    const ride = { status: 'OPEN', pickupStandId: BANANI_STAND, capacity: 3, seatsTaken: 1, isPrivate: false };
    const activeBookings = [{ dropZoneId: MOHAKHALI, gender: 'FEMALE', womenOnly: true }];
    expect(checkFit({ ride, activeBookings, candidate: nusrat(), zoneDistanceKm }).fits).toBe(true);
  });
});

describe('Private hire (Scenario D)', () => {
  const privateNusrat = { pickupStandId: null, dropZoneId: MOHAKHALI, seats: 1, rideType: 'PRIVATE', womenOnly: false, gender: 'FEMALE' };

  it('fits an empty Tesla', () => {
    expect(checkFit({ ride: null, activeBookings: [], candidate: privateNusrat, zoneDistanceKm }).fits).toBe(true);
  });

  it('does not fit a Tesla that already has a shared passenger (R6)', () => {
    const ride = { status: 'OPEN', pickupStandId: BANANI_STAND, capacity: 3, seatsTaken: 1, isPrivate: false };
    const activeBookings = [{ dropZoneId: MOHAKHALI, gender: 'FEMALE', womenOnly: false }];
    const result = checkFit({ ride, activeBookings, candidate: privateNusrat, zoneDistanceKm });
    expect(result.fits).toBe(false);
    expect(result.reasons.map((r) => r.rule)).toContain('R6');
  });

  it('a shared request does not fit a ride that is already private (R6)', () => {
    const ride = { status: 'OPEN', pickupStandId: null, capacity: 3, seatsTaken: 3, isPrivate: true };
    const activeBookings = [{ dropZoneId: MOHAKHALI, gender: 'FEMALE', womenOnly: false }];
    const result = checkFit({ ride, activeBookings, candidate: rafiq(), zoneDistanceKm });
    expect(result.fits).toBe(false);
    expect(result.reasons.map((r) => r.rule)).toContain('R6');
  });
});
