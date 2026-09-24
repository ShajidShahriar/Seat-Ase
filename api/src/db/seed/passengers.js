import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { normalizePhone } from '@seat-ase/shared';
import { db } from '../client.js';
import { pool } from '../pool.js';
import { users } from '../schema.js';
import { PASSENGERS } from './cast.js';
import { hashNid, last4 } from '../../lib/nid.js';
import { logger } from '../../lib/logger.js';

const BCRYPT_COST = 10;

export async function seedPassengers() {
  let usersAdded = 0;

  for (const passenger of PASSENGERS) {
    const phone = normalizePhone(passenger.phone);
    const [existing] = await db.select().from(users).where(eq(users.phone, phone));
    if (existing) continue;

    const passwordHash = await bcrypt.hash(passenger.password, BCRYPT_COST);
    const now = new Date();
    await db.insert(users).values({
      name: passenger.name,
      phone,
      passwordHash,
      role: 'PASSENGER',
      gender: passenger.gender,
      phoneVerifiedAt: now,
      nidHash: hashNid(passenger.nid),
      nidLast4: last4(passenger.nid),
      nidVerifiedAt: now,
    });
    usersAdded += 1;
  }

  return { usersAdded };
}

async function main() {
  const { usersAdded } = await seedPassengers();
  logger.info('seed:passengers complete', { usersAdded });
  await pool.end();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    logger.error('seed:passengers failed', { error: err.message });
    process.exit(1);
  });
}
