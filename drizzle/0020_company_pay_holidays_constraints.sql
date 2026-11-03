-- Pay plan (plans/2026-11-01-pattern-pay-holidays-missions.md) PR35–PR37: the company's own rows
-- (pattern_id NULL) never overlap each other. The EXCLUDEs of 0016 compare pattern_id WITH =,
-- which never matches NULL, so they leave company rows alone; a company holiday may share dates
-- with a pattern's own holiday (PR37).

ALTER TABLE "pattern_pay_rule" ADD CONSTRAINT "pattern_pay_rule_company_no_overlap"
	EXCLUDE USING gist (
		daterange("effective_from", "effective_to", '[)') WITH &&
	)
	WHERE ("pattern_id" IS NULL);
--> statement-breakpoint

ALTER TABLE "pattern_holiday" ADD CONSTRAINT "pattern_holiday_company_no_overlap"
	EXCLUDE USING gist (
		daterange("starts_on", "ends_on", '[]') WITH &&
	)
	WHERE ("pattern_id" IS NULL AND "cancelled_at" IS NULL);
