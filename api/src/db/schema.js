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
  integer,
  jsonb,
  check,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const placeKind = pgEnum('place_kind', ['STAND', 'LANDMARK']);
export const userRole = pgEnum('user_role', ['PASSENGER', 'DRIVER']);
export const userGender = pgEnum('user_gender', ['FEMALE', 'MALE', 'UNDISCLOSED']);
export const rideStatus = pgEnum('ride_status', ['OPEN', 'ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED']);
export const rideType = pgEnum('ride_type', ['SHARED', 'PRIVATE']);
export const bookingStatus = pgEnum('booking_status', [
  'REQUESTED',
  'MATCHED',
  'DRIVER_ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'NO_SHOW',
]);

// --- users ---
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  phone: text('phone').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull(),
  gender: userGender('gender').notNull().default('UNDISCLOSED'),
  phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
  nidHash: text('nid_hash').unique(),
  nidLast4: text('nid_last4'),
  nidVerifiedAt: timestamp('nid_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- otp_codes ---
export const otpCodes = pgTable('otp_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
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
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (table) => [check('vehicles_capacity_check', sql`${table.capacity} BETWEEN 1 AND 6`)],
);

// --- rides (the pool) ---
export const rides = pgTable(
  'rides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => users.id),
    pickupStandId: uuid('pickup_stand_id').references(() => places.id),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id),
    status: rideStatus('status').notNull().default('OPEN'),
    capacity: smallint('capacity').notNull(),
    seatsTaken: smallint('seats_taken').notNull().default(0),
    isPrivate: boolean('is_private').notNull().default(false),
    arrivedAt: timestamp('arrived_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('rides_seats_taken_check', sql`${table.seatsTaken} BETWEEN 0 AND ${table.capacity}`),
    uniqueIndex('rides_one_active_per_vehicle')
      .on(table.vehicleId)
      .where(sql`${table.status} IN ('OPEN', 'ARRIVED', 'STARTED')`),
  ],
);

// --- ride_requests (bookings) ---
export const rideRequests = pgTable(
  'ride_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    passengerId: uuid('passenger_id')
      .notNull()
      .references(() => users.id),
    rideId: uuid('ride_id').references(() => rides.id),
    status: bookingStatus('status').notNull().default('REQUESTED'),
    seats: smallint('seats').notNull(),
    rideType: rideType('ride_type').notNull().default('SHARED'),
    womenOnly: boolean('women_only').notNull().default(false),
    pickupStandId: uuid('pickup_stand_id').references(() => places.id),
    pickupLat: doublePrecision('pickup_lat'),
    pickupLng: doublePrecision('pickup_lng'),
    pickupZoneId: uuid('pickup_zone_id')
      .notNull()
      .references(() => zones.id),
    dropZoneId: uuid('drop_zone_id')
      .notNull()
      .references(() => zones.id),
    fareCapPoysha: integer('fare_cap_poysha'),
    farePoysha: integer('fare_poysha'),
    idempotencyKey: text('idempotency_key').notNull(),
    bodyHash: text('body_hash').notNull(),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    boardedAt: timestamp('boarded_at', { withTimezone: true }),
    droppedAt: timestamp('dropped_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('ride_requests_seats_check', sql`${table.seats} BETWEEN 1 AND 6`),
    uniqueIndex('ride_requests_idempotency_unique').on(table.passengerId, table.idempotencyKey),
    uniqueIndex('ride_requests_one_active_per_passenger')
      .on(table.passengerId)
      .where(sql`${table.status} IN ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'IN_PROGRESS')`),
  ],
);

// --- ride_events (history) ---
export const rideEvents = pgTable('ride_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  rideId: uuid('ride_id').references(() => rides.id),
  requestId: uuid('request_id').references(() => rideRequests.id),
  actorId: uuid('actor_id').references(() => users.id),
  type: text('type').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  details: jsonb('details'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
