import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { AppError } from '../lib/AppError.js';

// Reads verification status fresh from the database on every request, never from the JWT,
// so verifying a phone takes effect immediately instead of waiting for a new token.
export async function requireVerified(req, res, next) {
  const [user] = await db.select().from(users).where(eq(users.id, req.user.id));
  if (!user?.phoneVerifiedAt) {
    return next(new AppError(403, 'PHONE_NOT_VERIFIED', 'Verify your phone number first.'));
  }
  next();
}
