// Employee profile maths (plan 2026-11-01-employee-profile, phase 2). Pure helpers: no DB or
// SvelteKit imports, so they run in Vitest and in the browser.

import { addDays, daysBetween } from '#lib/roster/cycle.js';

/** Average days in a month, for the days left over after whole calendar months. */
const DAYS_PER_MONTH = 365.25 / 12;

/** Whole calendar months from `from` up to `end` (exclusive), and the days left after them. */
function calendarMonths(from: string, end: string): { months: number; days: number } {
	const [fy, fm, fd] = from.split('-').map(Number);
	const [ey, em, ed] = end.split('-').map(Number);
	let months = (ey - fy) * 12 + (em - fm) - (ed < fd ? 1 : 0);
	if (months < 0) months = 0;
	// Step from `from` by whole months. `Date.UTC` rolls a day past the month's end (31 Jan + 1
	// month) into the next month; the leftover days are then clamped at 0.
	const reached = new Date(Date.UTC(fy, fm - 1 + months, fd)).toISOString().slice(0, 10);
	return { months, days: Math.max(0, daysBetween(reached, end)) };
}

/** One name part: trimmed, inner runs of spaces collapsed, `null` when empty. */
export function cleanNamePart(value: string | null | undefined): string | null {
	const text = (value ?? '').trim().replace(/\s+/g, ' ');
	return text === '' ? null : text;
}

/** "first last" in one language (H1), or `null` when either part is missing. */
export function displayName(
	first: string | null | undefined,
	last: string | null | undefined
): string | null {
	const a = cleanNamePart(first);
	const b = cleanNamePart(last);
	return a && b ? `${a} ${b}` : null;
}

const ARABIC = /\p{Script=Arabic}/u;
/** Zero-width non-joiner: keeps two Arabic initials as separate letters instead of a word. */
const ZWNJ = '\u200c';

/**
 * Avatar initials (redesign plan V1): the first letter of the first two words, upper-cased; two
 * Arabic letters are kept apart with a zero-width non-joiner. `''` for an empty name.
 */
export function initials(name: string | null | undefined): string {
	const letters = (name ?? '')
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((word) => Array.from(word)[0].toLocaleUpperCase());
	return letters.every((letter) => ARABIC.test(letter)) ? letters.join(ZWNJ) : letters.join('');
}

export type NameParts = {
	firstNameEn: string | null;
	lastNameEn: string | null;
	firstNameAr: string | null;
	lastNameAr: string | null;
};

export type ResolvedNames =
	| { ok: true; parts: NameParts; fullName: string | null; fullNameAr: string | null }
	/** One part of a language is given without the other: the field to point at. */
	| { ok: false; field: keyof NameParts };

/**
 * The stored names from the parts (H1): per language, both parts give "first last", no part keeps
 * the `fallback` full name, one part alone is an error. `fullName` is `null` when neither the
 * English parts nor the fallback give a name (the caller decides whether that's allowed).
 */
export function resolveNames(
	input: NameParts,
	fallback: { fullName: string | null; fullNameAr: string | null }
): ResolvedNames {
	const parts: NameParts = {
		firstNameEn: cleanNamePart(input.firstNameEn),
		lastNameEn: cleanNamePart(input.lastNameEn),
		firstNameAr: cleanNamePart(input.firstNameAr),
		lastNameAr: cleanNamePart(input.lastNameAr)
	};
	const half = (first: keyof NameParts, last: keyof NameParts) =>
		parts[first] && !parts[last] ? last : !parts[first] && parts[last] ? first : null;
	const missing = half('firstNameEn', 'lastNameEn') ?? half('firstNameAr', 'lastNameAr');
	if (missing) return { ok: false, field: missing };

	return {
		ok: true,
		parts,
		fullName: displayName(parts.firstNameEn, parts.lastNameEn) ?? cleanNamePart(fallback.fullName),
		fullNameAr:
			displayName(parts.firstNameAr, parts.lastNameAr) ?? cleanNamePart(fallback.fullNameAr)
	};
}

/** A job: `endedOn` `null` = still ongoing. Dates are `YYYY-MM-DD`, both ends included. */
export type ExperienceSpan = { startedOn: string; endedOn: string | null };

/**
 * Months of experience (H3): earlier jobs plus the time here since `startDate`, overlaps counted
 * once, nothing counted after `today`.
 */
export function experienceMonths(
	jobs: readonly ExperienceSpan[],
	startDate: string | null,
	today: string
): number {
	const spans = [...jobs, ...(startDate ? [{ startedOn: startDate, endedOn: null }] : [])]
		.map(({ startedOn, endedOn }) => ({
			from: startedOn,
			to: endedOn === null || endedOn > today ? today : endedOn
		}))
		.filter(({ from, to }) => from <= to)
		.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));

	const merged: { from: string; to: string }[] = [];
	for (const span of spans) {
		const last = merged.at(-1);
		// Touching spans (one ends the day before the next starts) merge as well.
		if (last && span.from <= addDays(last.to, 1)) {
			if (span.to > last.to) last.to = span.to;
		} else {
			merged.push({ ...span });
		}
	}

	let months = 0;
	let days = 0;
	for (const { from, to } of merged) {
		const part = calendarMonths(from, addDays(to, 1));
		months += part.months;
		days += part.days;
	}
	return months + Math.floor(days / DAYS_PER_MONTH);
}

/** Whole years and the months left over. */
export function formatExperience(months: number): { years: number; months: number } {
	const total = Math.max(0, Math.floor(months));
	return { years: Math.floor(total / 12), months: total % 12 };
}

/** How many of a person's items are in each condition (H11). */
export function custodySummary<S extends string>(
	items: readonly { status: S }[]
): Partial<Record<S, number>> {
	const counts: Partial<Record<S, number>> = {};
	for (const { status } of items) counts[status] = (counts[status] ?? 0) + 1;
	return counts;
}

export type DocumentTypeState = { id: string; required: boolean; active: boolean };
export type DocumentState = { documentTypeId: string; received: boolean };

/**
 * "Received 3 of 5" (H5): required, active types only. `missing` lists the required type ids that
 * aren't received, in the order of `types`.
 */
export function documentSummary(
	types: readonly DocumentTypeState[],
	documents: readonly DocumentState[]
): { required: number; received: number; missing: string[] } {
	const received = new Set(documents.filter((d) => d.received).map((d) => d.documentTypeId));
	const required = types.filter((t) => t.required && t.active);
	const missing = required.filter((t) => !received.has(t.id)).map((t) => t.id);
	return { required: required.length, received: required.length - missing.length, missing };
}
