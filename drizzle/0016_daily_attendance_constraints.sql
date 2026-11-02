-- Pay plan (plans/2026-11-01-pattern-pay-holidays-missions.md) PR5, PR8: constraints drizzle-kit
-- cannot express. `btree_gist` is already installed (migration 0001).

-- One pattern's pay-rule versions never overlap; an open one (effective_to NULL) runs forever.
ALTER TABLE "pattern_pay_rule" ADD CONSTRAINT "pattern_pay_rule_no_overlap"
	EXCLUDE USING gist (
		"pattern_id" WITH =,
		daterange("effective_from", "effective_to", '[)') WITH &&
	);
--> statement-breakpoint

-- One pattern's active holidays never overlap (dates inclusive); cancelled ones are history.
ALTER TABLE "pattern_holiday" ADD CONSTRAINT "pattern_holiday_no_overlap"
	EXCLUDE USING gist (
		"pattern_id" WITH =,
		daterange("starts_on", "ends_on", '[]') WITH &&
	)
	WHERE ("cancelled_at" IS NULL);
