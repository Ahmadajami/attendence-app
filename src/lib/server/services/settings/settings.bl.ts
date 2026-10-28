import { auditInsert } from '#lib/server/audit.js';
import { db } from '#lib/server/db/index.js';
import { shiftStartsSchema, type ShiftStarts } from '#lib/schemas/settings.schema.js';
import { requireActorPermission, type Actor } from '../common.js';
import { findSetting, upsertSetting } from './settings.crud.js';

/** The airport shift starts, or `null` until the admin sets them. For other services' reads. */
export async function loadShiftStarts(): Promise<ShiftStarts | null> {
	const row = await findSetting('roster.shift_starts');
	if (!row) return null;
	// jsonb from the database: check the stored shape instead of trusting it.
	const parsed = shiftStartsSchema.safeParse(row.value);
	return parsed.success ? parsed.data : null;
}

export async function getShiftStarts(actor: Actor): Promise<ShiftStarts | null> {
	requireActorPermission(actor, 'settings.manage');
	return loadShiftStarts();
}

/** Set the Day and Night shift starts. Saved cycle versions keep the times they were saved with. */
export async function setShiftStarts(actor: Actor, input: ShiftStarts): Promise<ShiftStarts> {
	requireActorPermission(actor, 'settings.manage');
	const before = await loadShiftStarts();
	await db.batch([
		upsertSetting('roster.shift_starts', input, actor.user.id),
		auditInsert({
			actor: actor.user,
			action: 'setting.update',
			entityType: 'app_setting',
			entityId: 'roster.shift_starts',
			before,
			after: input
		})
	]);
	return input;
}
