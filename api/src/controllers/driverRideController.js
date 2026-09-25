import * as driverRideService from '../services/driverRideService.js';

export async function listRequests(req, res) {
  const requests = await driverRideService.listWaitingRequests(req.user.id);
  res.json({ requests });
}

export async function accept(req, res) {
  const result = await driverRideService.acceptRequest(req.user.id, req.params.id);
  res.json(result);
}

export async function cancelRide(req, res) {
  const ride = await driverRideService.cancelRide(req.user.id);
  res.json({ ride });
}

export async function arrive(req, res) {
  const ride = await driverRideService.arriveRide(req.user.id);
  res.json({ ride });
}

export async function board(req, res) {
  const request = await driverRideService.boardPassenger(req.user.id, req.params.id);
  res.json({ request });
}

export async function noShow(req, res) {
  const request = await driverRideService.markNoShow(req.user.id, req.params.id);
  res.json({ request });
}

export async function start(req, res) {
  const ride = await driverRideService.startRide(req.user.id);
  res.json({ ride });
}

export async function drop(req, res) {
  const result = await driverRideService.dropPassenger(req.user.id, req.params.id);
  res.json(result);
}

export async function getRide(req, res) {
  const result = await driverRideService.getDriverRide(req.user.id);
  res.json(result);
}

export async function getHistory(req, res) {
  const rides = await driverRideService.getDriverHistory(req.user.id);
  res.json({ rides });
}
