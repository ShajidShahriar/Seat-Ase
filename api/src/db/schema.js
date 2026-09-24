import {
  pgTable,
  uuid,
  text,
  doublePrecision,
  pgEnum,
  primaryKey,
  timestamp,
  smallint,
  boolean,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const placeKind = pgEnum('place_kind', ['STAND', 'LANDMARK']);
export const userRole = pgEnum('user_role', ['PASSENGER', 'DRIVER']);

// --- users ---
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  phone: text('phone').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- zones ---
export const zones = pgTable('zones', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  centerLat: doublePrecision('center_lat').notNull(),
  centerLng: doublePrecision('center_lng').notNull(),
});

// --- zone_distances ---
export const zoneDistances = pgTable(
  'zone_distances',
  {
    fromZoneId: uuid('from_zone_id')
      .notNull()
      .references(() => zones.id),
    toZoneId: uuid('to_zone_id')
      .notNull()
      .references(() => zones.id),
    distanceKm: doublePrecision('distance_km').notNull(),
  },
  (table) => [primaryKey({ columns: [table.fromZoneId, table.toZoneId] })],
);

// --- places ---
export const places = pgTable('places', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  kind: placeKind('kind').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  zoneId: uuid('zone_id')
    .notNull()
    .references(() => zones.id),
});

// --- vehicles ---
export const vehicles = pgTable(
  'vehicles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    driverId: uuid('driver_id')
      .notNull()
      .unique()
      .references(() => users.id),
    name: text('name').notNull(),
    registrationNo: text('registration_no').notNull().unique(),
    capacity: smallint('capacity').notNull(),
    isOnline: boolean('is_online').notNull().default(false),
    currentZoneId: uuid('current_zone_id').references(() => zones.id),
  },
  (table) => [check('vehicles_capacity_check', sql`${table.capacity} BETWEEN 1 AND 6`)],
);
