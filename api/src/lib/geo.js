const EARTH_RADIUS_KM = 6371;
export const ROAD_FACTOR = 1.3; // straight-line distance isn't a road; this is the design's fudge factor
const WALK_SPEED_KMH = 5;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Straight-line distance between two points in km. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Minutes to walk a straight-line distance, accounting for roads not being straight. */
export function walkMinutes(straightLineKm) {
  return (straightLineKm * ROAD_FACTOR * 60) / WALK_SPEED_KMH;
}
