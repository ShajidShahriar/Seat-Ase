CREATE TYPE "public"."place_kind" AS ENUM('STAND', 'LANDMARK');--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "place_kind" NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"zone_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zone_distances" (
	"from_zone_id" uuid NOT NULL,
	"to_zone_id" uuid NOT NULL,
	"distance_km" double precision NOT NULL,
	CONSTRAINT "zone_distances_from_zone_id_to_zone_id_pk" PRIMARY KEY("from_zone_id","to_zone_id")
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"center_lat" double precision NOT NULL,
	"center_lng" double precision NOT NULL,
	CONSTRAINT "zones_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_distances" ADD CONSTRAINT "zone_distances_from_zone_id_zones_id_fk" FOREIGN KEY ("from_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_distances" ADD CONSTRAINT "zone_distances_to_zone_id_zones_id_fk" FOREIGN KEY ("to_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;