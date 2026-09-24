import { describe, it, expect } from 'vitest';
import { soloFarePerSeatPoysha, pooledFarePerSeatPoysha, privateFarePoysha, estimateFares } from './fareService.js';

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
