-- Pay plan (plans/2026-11-01-pattern-pay-holidays-missions.md) PR22–PR23: the attendance edit log
-- is append-only. Lines are written by the recompute and never changed or removed, so the history
-- of every value stays true. TRUNCATE is refused as well.
CREATE FUNCTION "attendance_log_append_only"() RETURNS trigger
	LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'attendance_log is append-only (% refused)', TG_OP
		USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "attendance_log_no_update_delete"
	BEFORE UPDATE OR DELETE ON "attendance_log"
	FOR EACH ROW EXECUTE FUNCTION "attendance_log_append_only"();
--> statement-breakpoint
CREATE TRIGGER "attendance_log_no_truncate"
	BEFORE TRUNCATE ON "attendance_log"
	FOR EACH STATEMENT EXECUTE FUNCTION "attendance_log_append_only"();
