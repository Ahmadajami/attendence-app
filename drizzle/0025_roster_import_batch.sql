ALTER TYPE "public"."import_kind" ADD VALUE 'shifts';--> statement-breakpoint
ALTER TYPE "public"."import_kind" ADD VALUE 'roster';--> statement-breakpoint
ALTER TABLE "pattern" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "pattern_assignment" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "roster_override" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "shift" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "staff_schedule" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "swap_request" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "pattern" ADD CONSTRAINT "pattern_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_assignment" ADD CONSTRAINT "pattern_assignment_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_override" ADD CONSTRAINT "roster_override_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_schedule" ADD CONSTRAINT "staff_schedule_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_request" ADD CONSTRAINT "swap_request_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batch"("id") ON DELETE restrict ON UPDATE no action;