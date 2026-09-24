import * as otpService from '../services/otpService.js';
import * as authService from '../services/authService.js';

export async function send(req, res) {
  const user = await authService.findUserById(req.user.id);
  const result = await otpService.sendOtp(user.phone);
  res.json(result);
}

export async function verify(req, res) {
  const user = await authService.findUserById(req.user.id);
  await otpService.verifyOtp(user.phone, req.valid.body.code);
  res.status(204).end();
}
