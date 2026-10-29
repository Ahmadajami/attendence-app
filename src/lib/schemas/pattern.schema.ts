import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { WEEKLY_SLOTS } from '#lib/payroll/schedule.js';
import { MAX_CYCLE_DAYS } from '#lib/roster/rules.js';
import { PATTERN_TYPES, type PatternType } from './enums.js';

// The pattern library, assignments and people's own schedule rules (builder plan B1–B5). Slots are
// shift ids, `null` = off; forms post JSON (Superforms `dataType: 'json'`) so `null` survives.

/** Who a pattern is assigned to. */
export const ASSIGN_TARGETS = ['staff', 'team', 'department'] as const;
export type AssignTargetKind = (typeof ASSIGN_TARGETS)[number];

const isoDate = z.iso.date({ error: () => m.roster_date_invalid() });
const isIsoDate = (value: string) => isoDate.safeParse(value).success;

const reason = z
	.string()
	.trim()
	.min(1, { error: () => m.roster_reason_required() })
	.max(500);

const name = z
	.string()
	.trim()
	.min(1, { error: () => m.patterns_name_required() })
	.max(120);

/** `''` until one is chosen. */
const optionalId = z.union([z.literal(''), z.uuid()]).default('');

const slots = z
	.array(z.uuid().nullable())
	.min(1, { error: () => m.roster_cycle_empty() })
	.max(MAX_CYCLE_DAYS, { error: () => m.roster_cycle_too_long({ max: MAX_CYCLE_DAYS }) })
	.refine((value) => value.some((slot) => slot !== null), {
		error: () => m.roster_cycle_needs_work()
	});

/** A weekly pattern has 7 slots (Sunday first). */
function checkSlots(value: { type: PatternType; slots: unknown[] }, ctx: z.RefinementCtx) {
	if (value.type === 'weekly' && value.slots.length !== WEEKLY_SLOTS)
		ctx.addIssue({ code: 'custom', path: ['slots'], message: m.roster_weekly_days() });
}

const patternFields = {
	nameEn: name,
	nameAr: name,
	type: z.enum(PATTERN_TYPES).default('weekly'),
	slots,
	/** Weekly only: the shift for a day worked against the pattern's off day (B5). `''`: most used. */
	defaultWorkShiftId: optionalId
};

/** Create or edit a library pattern (`patternId` `''`: create). */
export const patternFormSchema = z
	.object({ patternId: optionalId, ...patternFields })
	.superRefine(checkSlots);
export type PatternFormSchema = typeof patternFormSchema;
export type PatternInput = z.infer<PatternFormSchema>;

const assignmentFields = {
	targetKind: z.enum(ASSIGN_TARGETS).default('team'),
	targetIds: z.array(z.uuid()).default([]),
	/** Today or later until periods exist (B7). */
	effectiveFrom: z.string().default(''),
	/** Cycle only: the date slot 0 falls on for these targets (B4). */
	anchorDate: z.string().default(''),
	reason: z.string().trim().max(500).default('')
};

type AssignmentValues = {
	targetIds: string[];
	effectiveFrom: string;
	anchorDate: string;
	reason: string;
};

function checkAssignment(value: AssignmentValues, cycle: boolean | null, ctx: z.RefinementCtx) {
	if (value.targetIds.length === 0)
		ctx.addIssue({ code: 'custom', path: ['targetIds'], message: m.assign_targets_required() });
	if (!isIsoDate(value.effectiveFrom))
		ctx.addIssue({ code: 'custom', path: ['effectiveFrom'], message: m.roster_date_invalid() });
	if (cycle === true && !isIsoDate(value.anchorDate))
		ctx.addIssue({ code: 'custom', path: ['anchorDate'], message: m.roster_date_invalid() });
	if (value.reason.length === 0)
		ctx.addIssue({ code: 'custom', path: ['reason'], message: m.roster_reason_required() });
}

/**
 * Assign a saved pattern to several targets of one kind from a date. The pattern's type is on the
 * server, so the service checks the anchor.
 */
export const assignmentFormSchema = z
	.object({ patternId: z.uuid(), ...assignmentFields })
	.superRefine((value, ctx) => checkAssignment(value, null, ctx));
export type AssignmentFormSchema = typeof assignmentFormSchema;
export type AssignmentInput = z.infer<AssignmentFormSchema>;

/**
 * The 3-step builder: the pattern (steps 1–2) and, when `assign` is on, its first assignment
 * (step 3).
 */
export const patternBuilderSchema = z
	.object({
		patternId: optionalId,
		...patternFields,
		assign: z.boolean().default(false),
		...assignmentFields
	})
	.superRefine((value, ctx) => {
		checkSlots(value, ctx);
		if (value.assign) checkAssignment(value, value.type === 'cycle', ctx);
	});
export type PatternBuilderSchema = typeof patternBuilderSchema;
export type PatternBuilderInput = z.infer<PatternBuilderSchema>;

/**
 * Change a used pattern from a date (B3): a copy with these days and names; every assignment of the
 * old one in force on or after `effectiveFrom` moves to the copy from then. `type` must stay the
 * old pattern's.
 */
export const editFromDateSchema = z
	.object({
		patternId: z.uuid(),
		...patternFields,
		effectiveFrom: isoDate,
		reason
	})
	.superRefine(checkSlots);
export type EditFromDateSchema = typeof editFromDateSchema;
export type EditFromDateInput = z.infer<EditFromDateSchema>;

/** Stop a target's assignment from a date; from then the next level applies (team, department). */
export const endAssignmentSchema = z.object({
	targetKind: z.enum(ASSIGN_TARGETS),
	targetId: z.uuid(),
	effectiveFrom: isoDate,
	reason
});
export type EndAssignmentSchema = typeof endAssignmentSchema;
export type EndAssignmentInput = z.infer<EndAssignmentSchema>;

/**
 * A person's own rules from a date (B4, B5): own off days (0 = Sunday … 6 = Saturday) for weekly
 * patterns, a crew start for cycles. `null`: follow the pattern; at least one is set.
 */
export const staffScheduleFormSchema = z
	.object({
		staffId: z.uuid(),
		offWeekdays: z.array(z.int().min(0).max(6)).nullable().default(null),
		crewStart: z
			.int()
			.min(0)
			.max(MAX_CYCLE_DAYS - 1)
			.nullable()
			.default(null),
		effectiveFrom: isoDate,
		reason
	})
	.superRefine((value, ctx) => {
		if (value.offWeekdays === null && value.crewStart === null)
			ctx.addIssue({ code: 'custom', path: ['offWeekdays'], message: m.schedule_rule_required() });
	});
export type StaffScheduleFormSchema = typeof staffScheduleFormSchema;
export type StaffScheduleInput = z.infer<StaffScheduleFormSchema>;

/** Back to the pattern's own days from a date. */
export const resetScheduleSchema = z.object({ staffId: z.uuid(), effectiveFrom: isoDate, reason });
export type ResetScheduleSchema = typeof resetScheduleSchema;
export type ResetScheduleInput = z.infer<ResetScheduleSchema>;

/** Superforms status message of the pattern, assignment and schedule forms. */
export type PatternMessage = { kind: 'success' | 'error'; text: string };
