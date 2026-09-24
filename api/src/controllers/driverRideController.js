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
