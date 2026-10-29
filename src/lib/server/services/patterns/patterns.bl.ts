import { randomUUID } from 'node:crypto';
import { m } from '#lib/paraglide/messages.js';
import { mostUsedShift } from '#lib/roster/cycle.js';
import type { AssignTargetKind, PatternInput } from '#lib/schemas/pattern.schema.js';
import type { PatternType } from '#lib/schemas/enums.js';
import { auditInsert } from '#lib/server/audit.js';
import { batch } from '#lib/server/db/index.js';
import { ConflictError, InvalidInputError, NotFoundError } from '#lib/server/errors.js';
import { todayInDamascus } from '#lib/server/time.js';
import { pgErrorCode, requireActorPermission, type Actor, type BatchQuery } from '../common.js';
import { loadShifts } from '../shifts/shifts.bl.js';
import {
	findPattern,
	insertPattern,
	isPatternUsed,
	listAssignmentTargets,
	listPatternRows,
	updatePattern,
	type PatternRow
} from './patterns.crud.js';

// The pattern library (builder plan B1, B3, B12, B14): build with `roster.manage`, view with
// `staff.write`. Who follows a pattern is the assignments service's.

/** Someone or something following a pattern now or from a later date. */
export type PatternFollower = {
	kind: AssignTargetKind;
	id: string;
	nameEn: string;
	nameAr: string | null;
	effectiveFrom: string;
	effectiveTo: string | null;
};

export type PatternListItem = PatternRow & {
	/** Current and scheduled followers (assignments not ended by today). */
	followers: PatternFollower[];
	/** Any assignment ever: days and type are read-only (B3). */
	used: boolean;
	/** Departments of the followers (a team's or a person's department), for the filter. */
	departmentIds: string[];
};

function duplicateName(error: unknown): ConflictError | undefined {
	if (pgErrorCode(error) !== '23505') return undefined;
	return new ConflictError('duplicate_name', m.patterns_error_duplicate(), {
		field: 'nameEn',
		cause: error
	});
}

export async function requirePattern(id: string): Promise<PatternRow> {
	const row = await findPattern(id);
	if (!row) throw new NotFoundError(m.patterns_error_not_found());
	return row;
}

/** Every slot and the default work shift must be active shifts (plan P2). */
export async function requireActiveShifts(ids: readonly (string | null)[]): Promise<void> {
	const active = new Set((await loadShifts()).filter((s) => s.active).map((s) => s.id));
	if (ids.some((id) => id !== null && !active.has(id)))
		throw new InvalidInputError('shift_inactive', m.roster_error_shift_inactive(), {
			field: 'slots'
		});
}

/**
 * The stored default work shift: weekly only; the chosen one, else the pattern's most used shift
 * (B5). Cycles have none.
 */
export function defaultWorkShift(
	type: PatternType,
	slots: readonly (string | null)[],
	chosen: string
): string | null {
	if (type !== 'weekly') return null;
	return chosen === '' ? mostUsedShift(slots) : chosen;
}

/** The library: every pattern with who follows it. */
export async function listPatterns(actor: Actor): Promise<PatternListItem[]> {
	requireActorPermission(actor, 'staff.write');
	const today = todayInDamascus();
	const [patterns, targets] = await Promise.all([listPatternRows(), listAssignmentTargets()]);
	return patterns.map((row) => {
		const own = targets.filter((t) => t.patternId === row.id);
		const followers = own
			.filter((t) => t.effectiveTo === null || t.effectiveTo > today)
			.map((t) => ({
				kind: (t.staffId ? 'staff' : t.teamId ? 'team' : 'department') as AssignTargetKind,
				id: t.staffId ?? t.teamId ?? '',
				nameEn: t.nameEn,
				nameAr: t.nameAr,
				effectiveFrom: t.effectiveFrom,
				effectiveTo: t.effectiveTo
			}));
		return {
			...row,
			followers,
			used: own.length > 0,
			departmentIds: [
				...new Set(own.flatMap((t) => (t.departmentId === null ? [] : [t.departmentId])))
			]
		};
	});
}

export async function getPattern(actor: Actor, id: string): Promise<PatternListItem> {
	requireActorPermission(actor, 'staff.write');
	const found = (await listPatterns(actor)).find((p) => p.id === id);
	if (!found) throw new NotFoundError(m.patterns_error_not_found());
	return found;
}

/** The statements that create a pattern and audit it (also used by the builder and "edit from"). */
export function createPatternStatements(
	actor: Actor,
	id: string,
	input: Omit<PatternInput, 'patternId'>,
	action = 'pattern.create'
): BatchQuery[] {
	const values = {
		id,
		nameEn: input.nameEn,
		nameAr: input.nameAr,
		type: input.type,
		slots: input.slots,
		defaultWorkShiftId: defaultWorkShift(input.type, input.slots, input.defaultWorkShiftId),
		createdBy: actor.user.id
	};
	return [
		insertPattern(values),
		auditInsert({ actor: actor.user, action, entityType: 'pattern', entityId: id, after: values })
	];
}

export async function createPattern(
	actor: Actor,
	input: Omit<PatternInput, 'patternId'>
): Promise<PatternRow> {
	requireActorPermission(actor, 'roster.manage');
	await requireActiveShifts([...input.slots, input.defaultWorkShiftId || null]);
	const id = randomUUID();
	try {
		await batch(createPatternStatements(actor, id, input));
	} catch (error) {
		throw duplicateName(error) ?? error;
	}
	return requirePattern(id);
}

const sameSlots = (a: readonly (string | null)[], b: readonly (string | null)[]) =>
	a.length === b.length && a.every((slot, i) => slot === b[i]);

/**
 * Edit a pattern. Once assigned, only its names stay editable (B3): days, type and default work
 * shift change through "edit from a date".
 */
export async function updatePatternDetails(
	actor: Actor,
	id: string,
	input: Omit<PatternInput, 'patternId'>
): Promise<PatternRow> {
	requireActorPermission(actor, 'roster.manage');
	const before = await requirePattern(id);
	const defaultWorkShiftId = defaultWorkShift(input.type, input.slots, input.defaultWorkShiftId);
	const daysChanged =
		before.type !== input.type ||
		!sameSlots(before.slots, input.slots) ||
		before.defaultWorkShiftId !== defaultWorkShiftId;
	if (daysChanged) {
		if (await isPatternUsed(id))
			throw new ConflictError('pattern_locked', m.patterns_error_locked(), { field: 'slots' });
		await requireActiveShifts([...input.slots, defaultWorkShiftId]);
	}
	const values = {
		nameEn: input.nameEn,
		nameAr: input.nameAr,
		type: input.type,
		slots: input.slots,
		defaultWorkShiftId
	};
	try {
		await batch([
			updatePattern(id, values),
			auditInsert({
				actor: actor.user,
				action: 'pattern.update',
				entityType: 'pattern',
				entityId: id,
				before: {
					nameEn: before.nameEn,
					nameAr: before.nameAr,
					type: before.type,
					slots: before.slots,
					defaultWorkShiftId: before.defaultWorkShiftId
				},
				after: values
			})
		]);
	} catch (error) {
		throw duplicateName(error) ?? error;
	}
	return requirePattern(id);
}

/** A copy named "Copy of …" (both languages); unused, so its days stay editable. */
export async function copyPattern(actor: Actor, id: string): Promise<PatternRow> {
	requireActorPermission(actor, 'roster.manage');
	const source = await requirePattern(id);
	const copyId = randomUUID();
	try {
		await batch(
			createPatternStatements(
				actor,
				copyId,
				{
					nameEn: m.patterns_copy_name({ name: source.nameEn }, { locale: 'en' }),
					nameAr: m.patterns_copy_name({ name: source.nameAr }, { locale: 'ar' }),
					type: source.type,
					slots: source.slots,
					defaultWorkShiftId: source.defaultWorkShiftId ?? ''
				},
				'pattern.copy'
			)
		);
	} catch (error) {
		throw duplicateName(error) ?? error;
	}
	return requirePattern(copyId);
}

/**
 * An inactive pattern can't be newly assigned; its current assignments still resolve. Never
 * deleted (CLAUDE.md §3, template §6.6).
 */
export async function setPatternActive(
	actor: Actor,
	id: string,
	active: boolean
): Promise<PatternRow> {
	requireActorPermission(actor, 'roster.manage');
	const before = await requirePattern(id);
	if (before.active === active) return before;
	await batch([
		updatePattern(id, { active }),
		auditInsert({
			actor: actor.user,
			action: active ? 'pattern.activate' : 'pattern.deactivate',
			entityType: 'pattern',
			entityId: id,
			before: { active: before.active },
			after: { active }
		})
	]);
	return { ...before, active };
}
