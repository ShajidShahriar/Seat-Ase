import * as authService from '../services/authService.js';
import { setAuthCookie, clearAuthCookie } from '../lib/cookies.js';

function toPublicUser(user) {
  return { id: user.id, name: user.name, phone: user.phone, role: user.role };
}

export async function signup(req, res) {
  const { user, token } = await authService.signup(req.valid.body);
  setAuthCookie(res, token);
  res.status(201).json({ user: toPublicUser(user) });
}

export async function login(req, res) {
  const { user, token } = await authService.login(req.valid.body);
  setAuthCookie(res, token);
  res.json({ user: toPublicUser(user) });
}

export function logout(req, res) {
  clearAuthCookie(res);
  res.status(204).end();
}

export async function me(req, res) {
  const user = await authService.findUserById(req.user.id);
  res.json({ user: toPublicUser(user) });
}
