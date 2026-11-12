ALTER TYPE "public"."import_kind" ADD VALUE 'punches';--> statement-breakpoint
ALTER TYPE "public"."import_status" ADD VALUE 'undone';--> statement-breakpoint
ALTER TABLE "absence" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "attendance_event" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "import_batch" ADD COLUMN "summary" jsonb;--> statement-breakpoint
ALTER TABLE "import_batch" ADD COLUMN "undone_by" uuid;--> statement-breakpoint
ALTER TABLE "import_batch" ADD COLUMN "undone_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "absence" ADD CONSTRAINT "absence_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_event" ADD CONSTRAINT "attendance_event_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_undone_by_user_id_fk" FOREIGN KEY ("undone_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "absence_import_batch_idx" ON "absence" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "attendance_event_import_batch_idx" ON "attendance_event" USING btree ("import_batch_id");