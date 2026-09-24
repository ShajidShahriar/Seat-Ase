import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const EXPIRES_IN = '7d';

export function signAuthToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyAuthToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}
