export const MAX_DROP_KM = 3;

const EMPTY_RIDE = { status: 'OPEN', pickupStandId: null, capacity: Infinity, seatsTaken: 0, isPrivate: false };

export function checkFit({ ride, activeBookings, candidate, zoneDistanceKm }) {
  const reasons = [];
  const current = ride ?? EMPTY_RIDE;

  if (current.status !== 'OPEN') {
    reasons.push({ rule: 'R4', message: 'This ride is no longer taking passengers.' });
    return { fits: false, reasons };
  }

  if (candidate.rideType === 'PRIVATE') {
    if (activeBookings.length > 0) {
      reasons.push({ rule: 'R6', message: 'Private hire needs an empty Tesla.' });
    }
  } else if (current.isPrivate) {
    reasons.push({ rule: 'R6', message: 'This Tesla is privately hired.' });
  }

  if (candidate.rideType !== 'PRIVATE' && current.pickupStandId && candidate.pickupStandId !== current.pickupStandId) {
    reasons.push({ rule: 'R1', message: 'Different pickup stand from this ride.' });
  }

  const freeSeats = current.capacity - current.seatsTaken;
  if (candidate.rideType !== 'PRIVATE' && candidate.seats > freeSeats) {
    reasons.push({ rule: 'R3', message: `Only ${freeSeats} seat(s) left, this request needs ${candidate.seats}.` });
  }

  for (const booking of activeBookings) {
    const km = zoneDistanceKm(candidate.dropZoneId, booking.dropZoneId);
    if (km > MAX_DROP_KM) {
      reasons.push({ rule: 'R2', message: `Drop-off is ${km}km from an existing passenger's stop (max ${MAX_DROP_KM}km).` });
      break;
    }
  }

  const rideIsWomenOnly = activeBookings.some((b) => b.womenOnly);
  if (candidate.womenOnly) {
    const allFemale = activeBookings.every((b) => b.gender === 'FEMALE');
    if (!allFemale) {
      reasons.push({ rule: 'R5', message: 'This ride has a male passenger.' });
    }
  } else if (rideIsWomenOnly && candidate.gender !== 'FEMALE') {
    reasons.push({ rule: 'R5', message: 'This is a women-only ride.' });
  }

  return { fits: reasons.length === 0, reasons };
}
