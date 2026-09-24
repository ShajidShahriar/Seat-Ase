const EARTH_RADIUS_KM = 6371;
const ROAD_FACTOR = 1.3; // same straight-line-to-road factor the design uses for walk time

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(a, b) {
  const dLat = toRad(b.centerLat - a.centerLat);
  const dLng = toRad(b.centerLng - a.centerLng);
  const lat1 = toRad(a.centerLat);
  const lat2 = toRad(b.centerLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

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
      const km = FIXED_KM.get(key) ?? roundToHalf(haversineKm(a, b) * ROAD_FACTOR);
      pairs.push({ fromName: a.name, toName: b.name, km });
    }
  }
  return pairs;
}
