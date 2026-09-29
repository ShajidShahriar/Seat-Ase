import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { normalizePhone } from '@seat-ase/shared';
import { db } from '../client.js';
import { pool } from '../pool.js';
import { users, vehicles } from '../schema.js';
import { DRIVERS } from './cast.js';
import { hashNid, last4 } from '../../lib/nid.js';
import { logger } from '../../lib/logger.js';

const BCRYPT_COST = 10;

export async function seedDrivers() {
  let usersAdded = 0;
  let vehiclesAdded = 0;

  for (const driver of DRIVERS) {
    const phone = normalizePhone(driver.phone);
    let [user] = await db.select().from(users).where(eq(users.phone, phone));

    const now = new Date();
    const identity = { gender: driver.gender, phoneVerifiedAt: now, nidHash: hashNid(driver.nid), nidLast4: last4(driver.nid), nidVerifiedAt: now };

    if (!user) {
      const passwordHash = await bcrypt.hash(driver.password, BCRYPT_COST);
      [user] = await db
        .insert(users)
        .values({ name: driver.name, phone, passwordHash, role: 'DRIVER', ...identity })
        .returning();
      usersAdded += 1;
    } else if (!user.phoneVerifiedAt || !user.nidHash) {
      [user] = await db.update(users).set(identity).where(eq(users.id, user.id)).returning();
    }

    const [existingVehicle] = await db.select().from(vehicles).where(eq(vehicles.driverId, user.id));
    if (!existingVehicle) {
      await db.insert(vehicles).values({ driverId: user.id, ...driver.vehicle });
      vehiclesAdded += 1;
    }
  }

  return { usersAdded, vehiclesAdded };
}

async function main() {
  const { usersAdded, vehiclesAdded } = await seedDrivers();
  logger.info('seed:drivers complete', { usersAdded, vehiclesAdded });
  await pool.end();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    logger.error('seed:drivers failed', { error: err.message });
    process.exit(1);
  });
}
