CREATE TABLE "pattern_holiday_exception" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern_id" uuid NOT NULL,
	"holiday_id" uuid NOT NULL,
	"applies" boolean DEFAULT true NOT NULL,
	"ot_eligible" boolean,
	"reason" text NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pattern_holiday_exception_reason_present" CHECK (length(trim("pattern_holiday_exception"."reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "pattern_holiday" ALTER COLUMN "pattern_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pattern_pay_rule" ALTER COLUMN "pattern_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pattern_holiday_exception" ADD CONSTRAINT "pattern_holiday_exception_pattern_id_pattern_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."pattern"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_holiday_exception" ADD CONSTRAINT "pattern_holiday_exception_holiday_id_pattern_holiday_id_fk" FOREIGN KEY ("holiday_id") REFERENCES "public"."pattern_holiday"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_holiday_exception" ADD CONSTRAINT "pattern_holiday_exception_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_holiday_exception" ADD CONSTRAINT "pattern_holiday_exception_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pattern_holiday_exception_unique" ON "pattern_holiday_exception" USING btree ("pattern_id","holiday_id");--> statement-breakpoint
CREATE INDEX "pattern_holiday_exception_holiday_idx" ON "pattern_holiday_exception" USING btree ("holiday_id");