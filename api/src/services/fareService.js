export const BASE_FARE_POYSHA = 4000;
export const PER_KM_POYSHA = 2500;
export const POOL_DISCOUNT_RATE = 0.25;
export const PRIVATE_PRICED_SEATS = 3;

function distanceChargePoysha(distanceKm) {
  return Math.round(distanceKm * PER_KM_POYSHA);
}

export function soloFarePerSeatPoysha(distanceKm) {
  return BASE_FARE_POYSHA + distanceChargePoysha(distanceKm);
}

export function pooledFarePerSeatPoysha(distanceKm) {
  const charge = distanceChargePoysha(distanceKm);
  const discount = Math.floor(charge * POOL_DISCOUNT_RATE);
  return BASE_FARE_POYSHA + charge - discount;
}

// ---- Private hire is priced for at most 3 seats: what the quote shows, whatever size of Tesla accepts ----

export function privateFarePoysha(distanceKm, capacity) {
  return soloFarePerSeatPoysha(distanceKm) * Math.min(capacity, PRIVATE_PRICED_SEATS);
}

export function estimateFares(distanceKm, { seats = 1, privateCapacity = PRIVATE_PRICED_SEATS } = {}) {
  return {
    soloPoysha: soloFarePerSeatPoysha(distanceKm) * seats,
    pooledPoysha: pooledFarePerSeatPoysha(distanceKm) * seats,
    privatePoysha: privateFarePoysha(distanceKm, privateCapacity),
  };
}
