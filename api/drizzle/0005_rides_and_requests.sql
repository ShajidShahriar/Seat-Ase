CREATE TYPE "public"."booking_status" AS ENUM('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW');--> statement-breakpoint
CREATE TYPE "public"."ride_status" AS ENUM('OPEN', 'ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."ride_type" AS ENUM('SHARED', 'PRIVATE');--> statement-breakpoint
CREATE TABLE "ride_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid,
	"request_id" uuid,
	"actor_id" uuid,
	"type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ride_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passenger_id" uuid NOT NULL,
	"ride_id" uuid,
	"status" "booking_status" DEFAULT 'REQUESTED' NOT NULL,
	"seats" smallint NOT NULL,
	"ride_type" "ride_type" DEFAULT 'SHARED' NOT NULL,
	"women_only" boolean DEFAULT false NOT NULL,
	"pickup_stand_id" uuid,
	"pickup_lat" double precision,
	"pickup_lng" double precision,
	"pickup_zone_id" uuid NOT NULL,
	"drop_zone_id" uuid NOT NULL,
	"fare_cap_poysha" integer,
	"idempotency_key" text NOT NULL,
	"body_hash" text NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"boarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ride_requests_seats_check" CHECK ("ride_requests"."seats" BETWEEN 1 AND 6)
);
--> statement-breakpoint
CREATE TABLE "rides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"pickup_stand_id" uuid,
	"zone_id" uuid NOT NULL,
	"status" "ride_status" DEFAULT 'OPEN' NOT NULL,
	"capacity" smallint NOT NULL,
	"seats_taken" smallint DEFAULT 0 NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"arrived_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rides_seats_taken_check" CHECK ("rides"."seats_taken" BETWEEN 0 AND "rides"."capacity")
);
--> statement-breakpoint
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_request_id_ride_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."ride_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_pickup_stand_id_places_id_fk" FOREIGN KEY ("pickup_stand_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_pickup_zone_id_zones_id_fk" FOREIGN KEY ("pickup_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_drop_zone_id_zones_id_fk" FOREIGN KEY ("drop_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_pickup_stand_id_places_id_fk" FOREIGN KEY ("pickup_stand_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ride_requests_idempotency_unique" ON "ride_requests" USING btree ("passenger_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ride_requests_one_active_per_passenger" ON "ride_requests" USING btree ("passenger_id") WHERE "ride_requests"."status" IN ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'IN_PROGRESS');--> statement-breakpoint
CREATE UNIQUE INDEX "rides_one_active_per_vehicle" ON "rides" USING btree ("vehicle_id") WHERE "rides"."status" IN ('OPEN', 'ARRIVED', 'STARTED');