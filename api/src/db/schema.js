import { pgTable, uuid, text, doublePrecision, pgEnum, primaryKey, timestamp } from 'drizzle-orm/pg-core';

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
