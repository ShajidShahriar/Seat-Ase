import * as rideRequestService from '../services/rideRequestService.js';
import * as authService from '../services/authService.js';

export async function create(req, res) {
  const passenger = await authService.findUserById(req.user.id);
  const idempotencyKey = req.header('Idempotency-Key');
  const { request, replay } = await rideRequestService.createRequest(passenger, req.valid.body, idempotencyKey);
  res.status(replay ? 200 : 201).json({ request });
}

export async function list(req, res) {
  const requests = await rideRequestService.listForPassenger(req.user.id);
  res.json({ requests });
}

export async function getOne(req, res) {
  const request = await rideRequestService.getOwnRequest(req.params.id, req.user.id);
  res.json({ request });
}

export async function cancel(req, res) {
  const request = await rideRequestService.cancelRequest(req.params.id, req.user.id);
  res.json({ request });
}

export async function getTimeline(req, res) {
  const timeline = await rideRequestService.getOwnTimeline(req.params.id, req.user.id);
  res.json({ timeline });
}

export async function getRideInfo(req, res) {
  const ride = await rideRequestService.getOwnRideInfo(req.params.id, req.user.id);
  res.json({ ride });
}
