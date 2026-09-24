import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../client.js';
import { users, vehicles, rideEvents, rideRequests, rides } from '../schema.js';
import { PASSENGERS } from './cast.js';
import { seedPassengers } from './passengers.js';

describe('passenger seed data', () => {
  // Seeded here, not assumed from a prior run: other test files in this suite
  // (auth, driver, otp) each wipe `users` in their own beforeEach, so this file
  // can't rely on any seed script having run earlier in the same test session.
  beforeAll(async () => {
    await db.delete(rideEvents);
    await db.delete(rideRequests);
    await db.delete(rides);
    await db.delete(vehicles);
    await db.delete(users);
    await seedPassengers();
  });

  it('seeds Nusrat, Rafiq and Shirin, pre-verified', async () => {
    for (const passenger of PASSENGERS) {
      const [user] = await db.select().from(users).where(eq(users.name, passenger.name));
      expect(user, `${passenger.name} should exist`).toBeTruthy();
      expect(user.role).toBe('PASSENGER');
      expect(user.gender).toBe(passenger.gender);
      expect(user.phoneVerifiedAt).not.toBeNull();
      expect(user.nidVerifiedAt).not.toBeNull();
      expect(user.nidLast4).toBe(passenger.nid.slice(-4));
    }
  });

  it('gives every passenger a unique nid hash', async () => {
    const hashes = new Set();
    for (const passenger of PASSENGERS) {
      const [user] = await db.select().from(users).where(eq(users.name, passenger.name));
      hashes.add(user.nidHash);
    }
    expect(hashes.size).toBe(PASSENGERS.length);
  });
});
