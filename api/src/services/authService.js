import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { AppError } from '../lib/AppError.js';
import { signAuthToken } from '../lib/jwt.js';
import { hashNid, last4 } from '../lib/nid.js';

const BCRYPT_COST = 10;

// A real bcrypt hash of no real password. Used so a login for an unregistered phone
// still pays the cost of one bcrypt.compare — otherwise the response time itself
// would reveal which phone numbers are registered.
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8i6ycESYYK5AV6VpKh.QjXsF9c1s2y';

export async function signup({ name, phone, password, role, gender, nid }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const [user] = await db
    .insert(users)
    .values({
      name,
      phone,
      passwordHash,
      role,
      gender,
      nidHash: hashNid(nid),
      nidLast4: last4(nid),
      nidVerifiedAt: new Date(),
    })
    .returning();
  return { user, token: signAuthToken(user) };
}

export async function login({ phone, password }) {
  const [user] = await db.select().from(users).where(eq(users.phone, phone));

  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Phone or password is incorrect.');
  }

  return { user, token: signAuthToken(user) };
}

export async function findUserById(id) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
}
