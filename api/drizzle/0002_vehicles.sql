CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"name" text NOT NULL,
	"registration_no" text NOT NULL,
	"capacity" smallint NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"current_zone_id" uuid,
	CONSTRAINT "vehicles_driver_id_unique" UNIQUE("driver_id"),
	CONSTRAINT "vehicles_registration_no_unique" UNIQUE("registration_no"),
	CONSTRAINT "vehicles_capacity_check" CHECK ("vehicles"."capacity" BETWEEN 1 AND 6)
);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_zone_id_zones_id_fk" FOREIGN KEY ("current_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;