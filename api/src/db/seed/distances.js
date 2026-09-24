import { haversineKm, ROAD_FACTOR } from '../../lib/geo.js';

function roundToHalf(km) {
  return Math.round(km * 2) / 2;
}

function pairKey(nameA, nameB) {
  return [nameA, nameB].sort().join('|');
}

// The 6 pairs the demo scenarios depend on — fixed exactly as designed, not estimated.
// Built with pairKey() itself so the lookup key can never drift out of alphabetical order.
const FIXED_KM = new Map([
  [pairKey('Banani', 'Mohakhali'), 3.0],
  [pairKey('Banani', 'Gulshan 1'), 2.0],
  [pairKey('Mohakhali', 'Gulshan 1'), 2.5],
  [pairKey('Banani', 'Tejgaon'), 4.0],
  [pairKey('Mohakhali', 'Tejgaon'), 2.0],
  [pairKey('Gulshan 1', 'Tejgaon'), 3.0],
]);

/**
 * Every unordered pair of zones with a distance in km: fixed values for the 6 pairs
 * the demo scenarios use, haversine * 1.3 (rounded to 0.5km) for the rest.
 */
export function buildZoneDistances(zones) {
  const pairs = [];
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const a = zones[i];
      const b = zones[j];
      const key = pairKey(a.name, b.name);
      const straightLineKm = haversineKm(a.centerLat, a.centerLng, b.centerLat, b.centerLng);
      const km = FIXED_KM.get(key) ?? roundToHalf(straightLineKm * ROAD_FACTOR);
      pairs.push({ fromName: a.name, toName: b.name, km });
    }
  }
  return pairs;
}
