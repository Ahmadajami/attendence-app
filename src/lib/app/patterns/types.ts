import type { PatternType } from '#lib/schemas/enums.js';

/** A library pattern as the assign sheet offers it. */
export type AssignablePattern = {
	id: string;
	nameEn: string;
	nameAr: string;
	type: PatternType;
	slots: (string | null)[];
	defaultWorkShiftId: string | null;
};

/** A person's own rules in force (or `null` fields: follow the pattern). */
export type OwnRules = { offWeekdays: readonly number[] | null; crewStart: number | null };
