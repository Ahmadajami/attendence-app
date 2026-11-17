-- TP32: the company's off-day leave-conversion versions never overlap. `daterange(..., '[)')`
-- allows adjacent versions (`effective_to` is exclusive) and an open-ended `NULL` `effective_to`.
-- Drizzle can't express an EXCLUDE, so it lives in this custom migration (convention: 0020).

ALTER TABLE "off_day_leave_conversion" ADD CONSTRAINT "off_day_leave_conversion_no_overlap"
	EXCLUDE USING gist (
		daterange("effective_from", "effective_to", '[)') WITH &&
	);
