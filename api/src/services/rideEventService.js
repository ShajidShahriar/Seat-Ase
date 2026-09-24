import { db } from '../db/client.js';
import { rideEvents } from '../db/schema.js';

export async function recordEvent({ rideId, requestId, actorId, type, fromStatus, toStatus, details }, client = db) {
  await client.insert(rideEvents).values({
    rideId: rideId ?? null,
    requestId: requestId ?? null,
    actorId: actorId ?? null,
    type,
    fromStatus: fromStatus ?? null,
    toStatus: toStatus ?? null,
    details: details ?? null,
  });
}
