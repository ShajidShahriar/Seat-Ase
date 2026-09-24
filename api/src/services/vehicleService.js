import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { vehicles } from '../db/schema.js';

export async function getVehicleByDriver(driverId) {
  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.driverId, driverId));
  return vehicle ?? null;
}

export async function addVehicle(driverId, { name, registrationNo, capacity }) {
  const [vehicle] = await db.insert(vehicles).values({ driverId, name, registrationNo, capacity }).returning();
  return vehicle;
}
