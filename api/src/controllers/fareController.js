import { getZoneDistanceKm } from '../services/placesService.js';
import { estimateFares } from '../services/fareService.js';

export async function estimate(req, res) {
  const { pickupZoneId, dropZoneId, seats } = req.valid.body;
  const distanceKm = await getZoneDistanceKm(pickupZoneId, dropZoneId);
  const fares = estimateFares(distanceKm, { seats });
  res.json({ distanceKm, ...fares });
}
