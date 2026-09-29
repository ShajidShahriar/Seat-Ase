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
 * the demo scenarios use, haversine * 1.3 (rounded to 0.5km) for the rest, then each
 * pair shortened to the shortest route through the table, so a detour is never cheaper.
 */
export function buildZoneDistances(zones) {
  const names = zones.map((z) => z.name);
  const km = new Map();
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const a = zones[i];
      const b = zones[j];
      const key = pairKey(a.name, b.name);
      const straightLineKm = haversineKm(a.centerLat, a.centerLng, b.centerLat, b.centerLng);
      km.set(key, FIXED_KM.get(key) ?? roundToHalf(straightLineKm * ROAD_FACTOR));
    }
  }

  const between = (a, b) => (a === b ? 0 : km.get(pairKey(a, b)));
  for (const via of names) {
    for (const a of names) {
      for (const b of names) {
        if (a >= b || via === a || via === b) continue;
        const detour = between(a, via) + between(via, b);
        if (detour < between(a, b)) km.set(pairKey(a, b), detour);
      }
    }
  }

  const pairs = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      pairs.push({ fromName: names[i], toName: names[j], km: between(names[i], names[j]) });
    }
  }
  return pairs;
}
