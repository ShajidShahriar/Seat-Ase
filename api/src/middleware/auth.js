import { AppError } from '../lib/AppError.js';
import { verifyAuthToken, signAuthToken } from '../lib/jwt.js';
import { setAuthCookie, AUTH_COOKIE } from '../lib/cookies.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return next(new AppError(401, 'UNAUTHENTICATED', 'You need to log in.'));

  let payload;
  try {
    payload = verifyAuthToken(token);
  } catch {
    return next(new AppError(401, 'UNAUTHENTICATED', 'Your session has expired, please log in again.'));
  }

  req.user = { id: payload.sub, role: payload.role };
  setAuthCookie(res, signAuthToken({ id: payload.sub, role: payload.role }));
  next();
}
