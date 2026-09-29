import { describe, it, expect } from 'vitest';
import { soloFarePerSeatPoysha, pooledFarePerSeatPoysha, privateFarePoysha, estimateFares, fareBreakdown } from './fareService.js';

describe('fareService', () => {
  it('matches Nusrat and Rafiq pooled fares from the design (Scenario A)', () => {
    expect(pooledFarePerSeatPoysha(3.0)).toBe(9625);
    expect(pooledFarePerSeatPoysha(2.0)).toBe(7750);
  });

  it('matches solo fares', () => {
    expect(soloFarePerSeatPoysha(3.0)).toBe(11500);
    expect(soloFarePerSeatPoysha(2.0)).toBe(9000);
  });

  it('matches Nusrat private fare in a 3-seat Tesla', () => {
    expect(privateFarePoysha(3.0, 3)).toBe(34500);
  });

  it('matches Shirin pooled fare in Scenario E (4.0km)', () => {
    expect(pooledFarePerSeatPoysha(4.0)).toBe(11500);
  });

  it('floors the pool discount to a whole poysha instead of leaving a fraction', () => {
    // 2.5km: distanceCharge = 6250, discount = 1562.5, must floor to 1562
    expect(pooledFarePerSeatPoysha(2.5)).toBe(4000 + 6250 - 1562);
  });

  it('prices a private ride as at most 3 seats, so a bigger Tesla never costs more than the quote', () => {
    expect(privateFarePoysha(3.0, 6)).toBe(34500);
    expect(privateFarePoysha(3.0, 4)).toBe(34500);
  });

  it('charges less than the quote in a smaller Tesla', () => {
    expect(privateFarePoysha(3.0, 2)).toBe(23000);
  });

  it('never discounts a private fare', () => {
    expect(privateFarePoysha(0, 3)).toBe(4000 * 3);
  });

  it('multiplies the per-seat fare by seats requested, but not the private fare', () => {
    const result = estimateFares(3.0, { seats: 2, privateCapacity: 3 });
    expect(result.soloPoysha).toBe(11500 * 2);
    expect(result.pooledPoysha).toBe(9625 * 2);
    expect(result.privatePoysha).toBe(34500);
  });

  it('treats 0km (same zone) as base fare only', () => {
    expect(soloFarePerSeatPoysha(0)).toBe(4000);
    expect(pooledFarePerSeatPoysha(0)).toBe(4000);
  });
});

describe('fareBreakdown: the working behind a fare, for the receipt', () => {
  it('Nusrat pooled, 3 km: 40 + 75 - 18.75 = 96.25', () => {
    expect(fareBreakdown(3.0, { kind: 'POOLED', seats: 1 })).toEqual({
      kind: 'POOLED', distanceKm: 3, basePoysha: 4000, perKmPoysha: 2500, distancePoysha: 7500,
      poolDiscountPoysha: 1875, seats: 1, perSeatPoysha: 9625, totalPoysha: 9625,
    });
  });

  it('solo, 3 km, 2 seats: (40 + 75) x 2 = 230', () => {
    const b = fareBreakdown(3.0, { kind: 'SOLO', seats: 2 });
    expect(b).toMatchObject({ poolDiscountPoysha: 0, perSeatPoysha: 11500, seats: 2, totalPoysha: 23000 });
  });

  it('private, 3 km: (40 + 75) x 3 seats = 345, even in a 6-seat Tesla', () => {
    const b = fareBreakdown(3.0, { kind: 'PRIVATE', capacity: 6 });
    expect(b).toMatchObject({ poolDiscountPoysha: 0, perSeatPoysha: 11500, seats: 3, totalPoysha: 34500 });
  });

  it('always agrees with the fare functions the rules use', () => {
    for (const km of [0, 1, 2, 2.5, 3, 4, 7.5]) {
      expect(fareBreakdown(km, { kind: 'POOLED', seats: 1 }).totalPoysha).toBe(pooledFarePerSeatPoysha(km));
      expect(fareBreakdown(km, { kind: 'SOLO', seats: 1 }).totalPoysha).toBe(soloFarePerSeatPoysha(km));
      expect(fareBreakdown(km, { kind: 'PRIVATE', capacity: 3 }).totalPoysha).toBe(privateFarePoysha(km, 3));
    }
  });
});
