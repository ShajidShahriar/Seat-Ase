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

// ---- The database enforces one phone and one NID per account; we only translate which rule fired ----

const DUPLICATE_ACCOUNT_ERRORS = {
  users_phone_unique: ['PHONE_TAKEN', 'An account with this phone number already exists. Log in instead.'],
  users_nid_hash_unique: ['NID_TAKEN', 'This NID is already linked to another account.'],
};

function duplicateAccountError(err) {
  const pgError = err?.cause ?? err;
  if (pgError?.code !== '23505') return null;
  const match = DUPLICATE_ACCOUNT_ERRORS[pgError.constraint];
  return match ? new AppError(409, ...match) : null;
}

export async function signup({ name, phone, password, role, gender, nid }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  try {
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
  } catch (err) {
    throw duplicateAccountError(err) ?? err;
  }
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
