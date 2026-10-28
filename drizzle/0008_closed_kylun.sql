CREATE TABLE "staff_team_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_team_membership_valid_order" CHECK ("staff_team_membership"."valid_to" IS NULL OR "staff_team_membership"."valid_to" > "staff_team_membership"."valid_from")
);
--> statement-breakpoint
ALTER TABLE "staff_team_membership" ADD CONSTRAINT "staff_team_membership_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_team_membership" ADD CONSTRAINT "staff_team_membership_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_team_membership_staff_idx" ON "staff_team_membership" USING btree ("staff_id","valid_from");--> statement-breakpoint
CREATE INDEX "staff_team_membership_team_idx" ON "staff_team_membership" USING btree ("team_id","valid_from");