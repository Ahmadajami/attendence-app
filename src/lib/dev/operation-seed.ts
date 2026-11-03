// Test data for the manual-test DB (plans/2026-11-03-e2e-operation-seed.md): the Operation team's
// planned days and made-up punches and absences. Pure: no DB, no SvelteKit; the script
// `scripts/seed-e2e-operation.ts` writes what this returns. Made-up people only (CLAUDE.md §1).
import { addDays, daysBetween, patternSlot, startOfDamascusDay } from '#lib/roster/cycle.js';

export type SeedShiftCode = 'D8' | 'N8';

/** The production Operation cycle (24 slots, `null` = off): nights, off, days, off, days, off. */
export const OPERATION_SLOTS: readonly (SeedShiftCode | null)[] = [
	...Array<SeedShiftCode>(4).fill('N8'),
	...Array<null>(4).fill(null),
	...Array<SeedShiftCode>(4).fill('D8'),
	...Array<null>(4).fill(null),
	...Array<SeedShiftCode>(4).fill('D8'),
	...Array<null>(4).fill(null)
];

/** Start and end as minutes of the day (Damascus); an end at or before the start is the next day. */
export const OPERATION_SHIFTS: Record<SeedShiftCode, { start: number; end: number }> = {
	D8: { start: 8 * 60, end: 20 * 60 },
	N8: { start: 20 * 60, end: 8 * 60 }
};

/** One monthly pattern: the dates it is assigned (`to` exclusive, `null` open) and each person's crew start. */
export type SeedMonth = {
	key: string;
	from: string;
	to: string | null;
	anchor: string;
	/** Per person, 0-based; `null` = no own rule (follows the team, slot 0). */
	crewStarts: readonly (number | null)[];
};

/**
 * Plan A (2026-11-03): November copies production's six crew starts; October gives each person
 * another teammate's November value; September another again. Nobody repeats a value across the
 * three months, and no two teammates share one in a month.
 */
export const OPERATION_MONTHS: readonly SeedMonth[] = [
	{
		key: 'Sep',
		from: '2026-09-01',
		to: '2026-10-01',
		anchor: '2026-09-01',
		crewStarts: [20, null, 1, 5, 9, 13]
	},
	{
		key: 'Oct',
		from: '2026-10-01',
		to: '2026-11-01',
		anchor: '2026-10-01',
		crewStarts: [9, 13, 20, null, 1, 5]
	},
	{
		key: 'Nov',
		from: '2026-11-01',
		to: null,
		anchor: '2026-11-01',
		crewStarts: [null, 1, 5, 9, 13, 20]
	}
];

export const OPERATION_PEOPLE = 6;
/** The shift dates that get punches (the user, 2026-11-03: September and October; no future). */
export const SEED_FROM = '2026-09-01';
export const SEED_TO = '2026-10-31';
/** A company holiday the seed creates; one person works it (holiday pay), the others don't punch. */
export const OPERATION_HOLIDAY = '2026-10-19';

export type PairKind =
	'on_time' | 'late' | 'early_leave' | 'overtime' | 'missing_out' | 'extra_shift' | 'holiday_work';

export type SeedPair = {
	person: number;
	shiftDate: string;
	shift: SeedShiftCode;
	checkIn: Date;
	/** `null`: the check-out is missing. */
	checkOut: Date | null;
	kind: PairKind;
	/** Required by the app on a punch on an unplanned day. */
	reason: string | null;
};

export type SeedAbsence = {
	person: number;
	startsOn: string;
	endsOn: string;
	type: 'sick' | 'leave';
};

export type SeedOutput = {
	pairs: SeedPair[];
	absences: SeedAbsence[];
	/** Planned work days left without punches or an absence on purpose. */
	noShows: { person: number; date: string }[];
};

export type SeedInput = {
	/** Inclusive shift dates; clamped to `SEED_FROM`…`SEED_TO`. */
	from?: string;
	to?: string;
	/** No pair may end after this. */
	now: Date;
	seed?: number;
	months?: readonly SeedMonth[];
};

/** The month whose pattern covers `date`, or `undefined` before the first one. */
export function monthOn(date: string, months: readonly SeedMonth[] = OPERATION_MONTHS) {
	return months.find((m) => date >= m.from && (m.to === null || date < m.to));
}

/** The shift `person` is planned on `date` (`null`: off or no pattern). */
export function plannedShift(
	person: number,
	date: string,
	months: readonly SeedMonth[] = OPERATION_MONTHS
): SeedShiftCode | null {
	const month = monthOn(date, months);
	if (!month) return null;
	const slot = patternSlot(
		{ type: 'cycle', slots: OPERATION_SLOTS, anchorDate: month.anchor },
		date,
		month.crewStarts[person] ?? 0
	);
	return slot as SeedShiftCode | null;
}

/** mulberry32: a small seeded generator, so every run gives the same data. */
function random(seed: number) {
	let a = seed >>> 0;
	const next = () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
	const shuffle = <T>(items: readonly T[]) => {
		const copy = [...items];
		for (let i = copy.length - 1; i > 0; i--) {
			const j = int(0, i);
			[copy[i], copy[j]] = [copy[j], copy[i]];
		}
		return copy;
	};
	return { int, shuffle };
}

function at(date: string, minutes: number): Date {
	return new Date(startOfDamascusDay(date).getTime() + minutes * 60_000);
}

function dates(from: string, to: string): string[] {
	const out: string[] = [];
	for (let i = 0; i <= daysBetween(from, to); i++) out.push(addDays(from, i));
	return out;
}

/** Per person and month: this many of each deviation (plan OP8). */
const PER_MONTH = { late: 2, early_leave: 1, overtime: 2 } as const;

/**
 * Team-wide cases (plan OP8), by person index and month key. Each lands on the first suitable
 * date of that person's month after shuffling, so the data stays the same between runs.
 */
const TEAM_CASES = {
	missingOut: [
		{ person: 0, month: 'Sep' },
		{ person: 3, month: 'Oct' }
	],
	noShow: [
		{ person: 1, month: 'Sep' },
		{ person: 4, month: 'Oct' }
	],
	sick: { person: 2, month: 'Sep', days: 2 },
	leave: { person: 5, startsOn: '2026-10-26', endsOn: '2026-10-29' },
	extraShift: { person: 0, month: 'Oct', shift: 'D8' as SeedShiftCode },
	holidayWorker: 'first planned' as const
};

/**
 * The Operation team's made-up punches and absences on shift dates `SEED_FROM`…`SEED_TO`, narrowed
 * to `[from, to]`. Deterministic for a seed: the cases are always placed over the whole seed
 * range, so a narrower range returns a subset of the same rows.
 */
export function buildOperationSeed(input: SeedInput): SeedOutput {
	const months = input.months ?? OPERATION_MONTHS;
	const rng = random(input.seed ?? 20261103);
	const all = dates(SEED_FROM, SEED_TO);
	const from = input.from && input.from > SEED_FROM ? input.from : SEED_FROM;
	const to = input.to && input.to < SEED_TO ? input.to : SEED_TO;

	const absences: SeedAbsence[] = [];
	const absent = new Set<string>();
	const key = (person: number, date: string) => `${person}|${date}`;
	const addAbsence = (a: SeedAbsence) => {
		absences.push(a);
		for (const d of dates(a.startsOn, a.endsOn)) absent.add(key(a.person, d));
	};

	const workDays = (person: number, monthKey: string) =>
		all.filter(
			(d) =>
				monthOn(d, months)?.key === monthKey &&
				d !== OPERATION_HOLIDAY &&
				plannedShift(person, d, months) !== null
		);

	// Sick: the first run of `days` consecutive planned work days in the month (after shuffling the start).
	{
		const { person, month, days } = TEAM_CASES.sick;
		const work = workDays(person, month);
		const starts = rng.shuffle(work).filter((d) => {
			for (let i = 1; i < days; i++) if (!work.includes(addDays(d, i))) return false;
			return true;
		});
		if (starts[0])
			addAbsence({
				person,
				startsOn: starts[0],
				endsOn: addDays(starts[0], days - 1),
				type: 'sick'
			});
	}
	addAbsence({ ...TEAM_CASES.leave, type: 'leave' });

	// Kinds per person and date.
	const kinds = new Map<string, PairKind>();
	const noShows: { person: number; date: string }[] = [];
	const free = (person: number, monthKey: string) =>
		rng
			.shuffle(workDays(person, monthKey))
			.filter((d) => !absent.has(key(person, d)) && !kinds.has(key(person, d)));

	for (const { person, month } of TEAM_CASES.noShow) {
		const d = free(person, month)[0];
		if (d) {
			kinds.set(key(person, d), 'on_time'); // reserves the date; the pair loop skips no-shows
			noShows.push({ person, date: d });
		}
	}
	for (const { person, month } of TEAM_CASES.missingOut) {
		const d = free(person, month)[0];
		if (d) kinds.set(key(person, d), 'missing_out');
	}
	for (const month of months) {
		for (let person = 0; person < OPERATION_PEOPLE; person++) {
			const pool = free(person, month.key);
			let i = 0;
			for (const [kind, count] of Object.entries(PER_MONTH) as [PairKind, number][])
				for (let n = 0; n < count && i < pool.length; n++) kinds.set(key(person, pool[i++]), kind);
		}
	}

	// Planned pairs.
	const pairs: SeedPair[] = [];
	const holidayPlanned: number[] = [];
	for (const date of all) {
		for (let person = 0; person < OPERATION_PEOPLE; person++) {
			const shift = plannedShift(person, date, months);
			if (shift === null || absent.has(key(person, date))) continue;
			if (noShows.some((n) => n.person === person && n.date === date)) continue;
			if (date === OPERATION_HOLIDAY) {
				holidayPlanned.push(person);
				continue;
			}
			pairs.push(makePair(person, date, shift, kinds.get(key(person, date)) ?? 'on_time', null));
		}
	}

	// The holiday: the first person planned to work it works it.
	if (holidayPlanned.length > 0) {
		const person = holidayPlanned[0];
		const shift = plannedShift(person, OPERATION_HOLIDAY, months);
		if (shift) pairs.push(makePair(person, OPERATION_HOLIDAY, shift, 'holiday_work', null));
	}

	// The extra shift: an off day whose day before is also off (no night shift ends that morning).
	{
		const { person, month, shift } = TEAM_CASES.extraShift;
		const offDays = all.filter(
			(d) =>
				monthOn(d, months)?.key === month &&
				d !== OPERATION_HOLIDAY &&
				plannedShift(person, d, months) === null &&
				plannedShift(person, addDays(d, -1), months) === null &&
				!absent.has(key(person, d))
		);
		const d = rng.shuffle(offDays)[0];
		if (d) pairs.push(makePair(person, d, shift, 'extra_shift', 'E2E seed: extra shift'));
	}

	function makePair(
		person: number,
		date: string,
		shift: SeedShiftCode,
		kind: PairKind,
		reason: string | null
	): SeedPair {
		const { start, end } = OPERATION_SHIFTS[shift];
		const endDate = end <= start ? addDays(date, 1) : date;
		const inMinutes = kind === 'late' ? start + rng.int(10, 45) : start - rng.int(5, 20);
		const outMinutes =
			kind === 'early_leave'
				? end - rng.int(15, 60)
				: kind === 'overtime'
					? end + rng.int(30, 90)
					: end + rng.int(0, 10);
		return {
			person,
			shiftDate: date,
			shift,
			checkIn: at(date, inMinutes),
			checkOut: kind === 'missing_out' ? null : at(endDate, outMinutes),
			kind,
			reason
		};
	}

	// One person's pairs never overlap: where a night ends after the next shift's check-in (the
	// month change can put a day shift right after a night), the night's check-out moves earlier.
	pairs.sort((a, b) => a.person - b.person || a.checkIn.getTime() - b.checkIn.getTime());
	for (let i = 1; i < pairs.length; i++) {
		const prev = pairs[i - 1];
		const cur = pairs[i];
		if (prev.person !== cur.person || prev.checkOut === null) continue;
		if (prev.checkOut.getTime() >= cur.checkIn.getTime())
			prev.checkOut = new Date(cur.checkIn.getTime() - 5 * 60_000);
	}

	const inRange = (d: string) => d >= from && d <= to;
	const now = input.now.getTime();
	return {
		pairs: pairs.filter(
			(p) =>
				inRange(p.shiftDate) &&
				p.checkIn.getTime() <= now &&
				(p.checkOut === null || p.checkOut.getTime() <= now)
		),
		absences: absences.filter((a) => a.startsOn >= from && a.endsOn <= to),
		noShows: noShows.filter((n) => inRange(n.date))
	};
}
