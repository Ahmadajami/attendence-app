CREATE TYPE "public"."session_client" AS ENUM('web', 'api');--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "client" "session_client" DEFAULT 'web' NOT NULL;