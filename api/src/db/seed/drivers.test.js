import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { normalizePhone } from '@seat-ase/shared';
import { db } from '../client.js';
import { users, vehicles, otpCodes, rideEvents, rideRequests, rides } from '../schema.js';
import { DRIVERS } from './cast.js';
import { seedDrivers } from './drivers.js';

describe('driver seed data', () => {
  beforeEach(async () => {
    await db.delete(rideEvents);
    await db.delete(rideRequests);
    await db.delete(rides);
    await db.delete(vehicles);
    await db.delete(otpCodes);
    await db.delete(users);
  });

  it('seeds Jashim and Mokbul with a verified phone and NID, like a real signup', async () => {
    await seedDrivers();
    for (const driver of DRIVERS) {
      const [user] = await db.select().from(users).where(eq(users.phone, normalizePhone(driver.phone)));
      expect(user.role).toBe('DRIVER');
      expect(user.gender).toBe('MALE');
      expect(user.phoneVerifiedAt).not.toBeNull();
      expect(user.nidVerifiedAt).not.toBeNull();
      expect(user.nidLast4).toBe(driver.nid.slice(-4));
    }
  });

  it('upgrades a cast driver who was seeded before, without a phone check or NID', async () => {
    await db.insert(users).values({ name: 'Jashim', phone: normalizePhone(DRIVERS[0].phone), passwordHash: 'old-hash', role: 'DRIVER' });
    await seedDrivers();
    const [jashim] = await db.select().from(users).where(eq(users.phone, normalizePhone(DRIVERS[0].phone)));
    expect(jashim.phoneVerifiedAt).not.toBeNull();
    expect(jashim.nidLast4).toBe(DRIVERS[0].nid.slice(-4));
    expect(jashim.passwordHash).toBe('old-hash');
  });
});
