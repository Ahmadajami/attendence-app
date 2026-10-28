ALTER TABLE "user" ADD COLUMN "password_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "failed_login_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_failed_login_count_non_negative" CHECK ("user"."failed_login_count" >= 0);