import * as placesService from '../services/placesService.js';
import { onlineCountInZone } from '../services/vehicleService.js';
import { db } from '../db/client.js';
import { zones } from '../db/schema.js';

export async function searchPlaces(req, res) {
  const query = String(req.query.q ?? '').trim();
  if (!query) {
    return res.json({ places: [] });
  }
  const results = await placesService.search(query);
  res.json({ places: results });
}

export async function listZones(req, res) {
  const rows = await db.select().from(zones);
  res.json({ zones: rows });
}

export async function nearestStand(req, res) {
  const { lat, lng } = req.valid.body;
  const result = await placesService.nearestStandWithWalk(lat, lng);
  res.json(result);
}

export async function onlineCount(req, res) {
  const count = await onlineCountInZone(req.params.zoneId);
  res.json({ count });
}
