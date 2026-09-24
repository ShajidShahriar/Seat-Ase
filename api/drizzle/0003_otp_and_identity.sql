CREATE TYPE "public"."user_gender" AS ENUM('FEMALE', 'MALE', 'UNDISCLOSED');--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gender" "user_gender" DEFAULT 'UNDISCLOSED' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "nid_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "nid_last4" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "nid_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_nid_hash_unique" UNIQUE("nid_hash");