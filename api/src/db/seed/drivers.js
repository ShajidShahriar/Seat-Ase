import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { normalizePhone } from '@seat-ase/shared';
import { db } from '../client.js';
import { pool } from '../pool.js';
import { users, vehicles } from '../schema.js';
import { DRIVERS } from './cast.js';
import { logger } from '../../lib/logger.js';

const BCRYPT_COST = 10;

async function seedDrivers() {
  let usersAdded = 0;
  let vehiclesAdded = 0;

  for (const driver of DRIVERS) {
    const phone = normalizePhone(driver.phone);
    let [user] = await db.select().from(users).where(eq(users.phone, phone));

    if (!user) {
      const passwordHash = await bcrypt.hash(driver.password, BCRYPT_COST);
      [user] = await db
        .insert(users)
        .values({ name: driver.name, phone, passwordHash, role: 'DRIVER' })
        .returning();
      usersAdded += 1;
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

main().catch((err) => {
  logger.error('seed:drivers failed', { error: err.message });
  process.exit(1);
});
