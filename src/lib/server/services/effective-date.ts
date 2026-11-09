import { m } from '#lib/paraglide/messages.js';
import { MAX_BACKFILL_DAYS, withinBackdateLimit } from '#lib/roster/backdate.js';
import { InvalidInputError } from '#lib/server/errors.js';
import { todayInDamascus } from '#lib/server/time.js';

// The start-date check of every change "from a date" (builder plan B7b): a past date is allowed
// with the form's reason (audited), up to `MAX_BACKFILL_DAYS` back, until payroll periods exist.
// The services then recompute the stored days from that date to today.

/** Refuse a start date further back than the limit; `field` is the form field to mark. */
export function requireEffectiveDate(date: string, field = 'effectiveFrom'): void {
	if (!withinBackdateLimit(date, todayInDamascus()))
		throw new InvalidInputError(
			'effective_too_old',
			m.roster_error_effective_too_old({ max: MAX_BACKFILL_DAYS }),
			{ field }
		);
}
