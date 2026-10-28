import { randomUUID } from 'node:crypto';
import { auditInsert } from '#lib/server/audit.js';
import { m } from '#lib/paraglide/messages.js';
import { parseClock } from '#lib/payroll/schedule.js';
import { batch } from '#lib/server/db/index.js';
import { ConflictError, NotFoundError } from '#lib/server/errors.js';
import type { ShiftInput } from '#lib/schemas/shift.schema.js';
import { pgErrorCode, requireActorPermission, type Actor } from '../common.js';
import {
	countShiftUsage,
	findShift,
	insertShift,
	isShiftUsed,
	listShiftRows,
	updateShift as updateShiftRow,
	type ShiftRow
} from './shifts.crud.js';

export type ShiftListItem = ShiftRow & {
	/** Pattern versions with a slot on this shift. */
	patternCount: number;
	/** Times, break, required, windows and code are locked (plan P1). */
	used: boolean;
};

/** Fields that can't change once a pattern, override or punch uses the shift (plan P1). */
const LOCKED_FIELDS = [
	'code',
	'startTime',
	'endTime',
	'breakMinutes',
	'requiredMinutes',
	'windowBeforeMinutes',
	'windowAfterMinutes'
] as const satisfies readonly (keyof ShiftInput)[];

/** Every shift (inactive too, so saved patterns resolve). For other services' reads. */
export async function loadShifts(): Promise<ShiftRow[]> {
	return listShiftRows();
}

/** Every shift, by code. */
export async function listShifts(actor: Actor): Promise<ShiftRow[]> {
	requireActorPermission(actor, 'staff.write');
	return listShiftRows();
}

/** Every shift with how much uses it, for the shifts page. */
export async function listShiftsWithUsage(actor: Actor): Promise<ShiftListItem[]> {
	requireActorPermission(actor, 'staff.write');
	const [rows, usage] = await Promise.all([listShiftRows(), countShiftUsage()]);
	return rows.map((row) => {
		const u = usage.get(row.id);
		return {
			...row,
			patternCount: u?.patterns ?? 0,
			used: u !== undefined && u.patterns + u.overrides + u.events > 0
		};
	});
}

async function requireShift(id: string): Promise<ShiftRow> {
	const row = await findShift(id);
	if (!row) throw new NotFoundError(m.shifts_error_not_found());
	return row;
}

function duplicateCode(error: unknown): ConflictError | undefined {
	if (pgErrorCode(error) !== '23505') return undefined;
	return new ConflictError('duplicate_code', m.shifts_error_duplicate(), {
		field: 'code',
		cause: error
	});
}

/** Stored `HH:mm:ss` and typed `HH:mm` compare by minute. */
function sameValue(field: (typeof LOCKED_FIELDS)[number], before: ShiftRow, input: ShiftInput) {
	if (field === 'startTime' || field === 'endTime')
		return parseClock(before[field]) === parseClock(input[field]);
	return before[field] === input[field];
}

export async function createShift(actor: Actor, input: ShiftInput): Promise<ShiftRow> {
	requireActorPermission(actor, 'roster.manage');
	const id = randomUUID();
	try {
		await batch([
			insertShift({ id, ...input, createdBy: actor.user.id }),
			auditInsert({
				actor: actor.user,
				action: 'shift.create',
				entityType: 'shift',
				entityId: id,
				after: input
			})
		]);
	} catch (error) {
		throw duplicateCode(error) ?? error;
	}
	return { id, ...input, active: true };
}

/**
 * Edit a shift. Once it is used, only names, colour and grace may change (plan P1): create a new
 * shift for other times.
 */
export async function updateShift(actor: Actor, id: string, input: ShiftInput): Promise<ShiftRow> {
	requireActorPermission(actor, 'roster.manage');
	const before = await requireShift(id);
	const changed = LOCKED_FIELDS.find((field) => !sameValue(field, before, input));
	if (changed && (await isShiftUsed(id)))
		throw new ConflictError('shift_locked', m.shifts_error_locked(), { field: changed });

	try {
		await batch([
			updateShiftRow(id, input),
			auditInsert({
				actor: actor.user,
				action: 'shift.update',
				entityType: 'shift',
				entityId: id,
				before,
				after: input
			})
		]);
	} catch (error) {
		throw duplicateCode(error) ?? error;
	}
	return { ...before, ...input };
}

/**
 * Deactivate or reactivate. Never deleted (plan P2): an inactive shift can't go into new patterns
 * or overrides, but saved ones still resolve.
 */
export async function setShiftActive(actor: Actor, id: string, active: boolean): Promise<ShiftRow> {
	requireActorPermission(actor, 'roster.manage');
	const before = await requireShift(id);
	if (before.active === active) return before;
	await batch([
		updateShiftRow(id, { active }),
		auditInsert({
			actor: actor.user,
			action: active ? 'shift.activate' : 'shift.deactivate',
			entityType: 'shift',
			entityId: id,
			before: { active: before.active },
			after: { active }
		})
	]);
	return { ...before, active };
}
