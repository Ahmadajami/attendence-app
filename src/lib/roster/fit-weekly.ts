// A month grid (person × date → shift or off) → the weekly roster HR would have typed (plan
// 2026-11-12-roster-import, RI4): per team one weekly pattern, own off days, personal patterns for
// people on another shift, and day changes for whatever is left. `replayFit` runs the result
// through `rosterDay` and lists every day that doesn't give the grid. Pure: ids in, ids out.
import { rosterInputOf, type RosterData } from './input.js';
import { rosterDay, type RosterAssignment, type RosterSchedule } from './roster.js';

/** A grid cell: a shift id, `null` for a day off, `undefined` for no plan that day. */
export type GridCell = string | null | undefined;

export type GridPerson = {
	staffId: string;
	teamId: string;
	/** One cell per `dates` entry. */
	cells: readonly GridCell[];
};

export type FitInput = {
	/** The month's dates, `YYYY-MM-DD`, consecutive. */
	dates: readonly string[];
	people: readonly GridPerson[];
	/**
	 * Groups planned person by person (no group pattern, no own rules): every person gets the
	 * personal pattern of their shift and off days. For people without a department, whose team
	 * pattern would also reach team members planned by a department (plan RI10).
	 */
	personalGroups?: ReadonlySet<string>;
	/**
	 * Groups that join the pattern the app already has for them in the month (RI11): its shift and
	 * off weekdays are given, no group pattern is made, and each person is fitted against it.
	 */
	joined?: ReadonlyMap<string, { mainShiftId: string; offWeekdays: readonly number[] }>;
};

/** Weekly slots, Sunday first: the shift on a work weekday, `null` on an off weekday. */
export type WeeklySlots = (string | null)[];

export type PersonalFit = {
	shiftId: string;
	offWeekdays: number[];
	slots: WeeklySlots;
	staffIds: string[];
};

export type DayChange = { staffId: string; date: string; shiftId: string | null };

/**
 * A self swap (app `self_swap`, normal pay): on `firstDate` the person's planned work day is off; on
 * `secondDate` their planned off day works that day's shift. `scope`: both in one Sunday–Saturday
 * week, else one calendar month.
 */
export type SelfSwapFit = {
	staffId: string;
	firstDate: string;
	secondDate: string;
	shiftId: string;
	scope: 'week' | 'month';
};

export type TeamFit = {
	teamId: string;
	/** `null` when nobody of the team works in the grid (no pattern is made). */
	mainShiftId: string | null;
	/** The group follows a pattern already in the app (RI11): nothing is made for the group. */
	joined: boolean;
	offWeekdays: number[];
	slots: WeeklySlots;
	ownRules: { staffId: string; offWeekdays: number[] }[];
	personal: PersonalFit[];
	/** Day edits left after the self swaps were paired. */
	changes: DayChange[];
	swaps: SelfSwapFit[];
	/** People with planned days whose own weekdays could not be read (no cell at all). */
	unplanned: string[];
};

/** 0 = Sunday … 6 = Saturday, for a `YYYY-MM-DD` date. */
export function weekdayOf(date: string): number {
	return new Date(`${date}T00:00:00Z`).getUTCDay();
}

const key = (offs: readonly number[]) => offs.join(',');

/** The most frequent value; ties go to the smallest key, so the result never depends on order. */
function mostCommon<T>(items: readonly T[], keyOf: (item: T) => string): T | undefined {
	const counts = new Map<string, { item: T; n: number }>();
	for (const item of items) {
		const k = keyOf(item);
		const entry = counts.get(k);
		if (entry) entry.n++;
		else counts.set(k, { item, n: 1 });
	}
	let best: { k: string; item: T; n: number } | undefined;
	for (const [k, { item, n }] of counts)
		if (!best || n > best.n || (n === best.n && k < best.k)) best = { k, item, n };
	return best?.item;
}

/**
 * A person's reading of the grid: their main shift (most work days) and their off weekdays — a
 * weekday is off when it is off on more than half of the person's planned days on that weekday,
 * and on at least two of them (a single day off is a day change, not a rule).
 */
export function readPerson(dates: readonly string[], cells: readonly GridCell[]) {
	const work = cells.filter((c): c is string => typeof c === 'string');
	const mainShiftId = mostCommon(work, (s) => s) ?? null;
	const seen = Array<number>(7).fill(0);
	const off = Array<number>(7).fill(0);
	dates.forEach((date, i) => {
		const cell = cells[i];
		if (cell === undefined) return;
		const w = weekdayOf(date);
		seen[w]++;
		if (cell === null) off[w]++;
	});
	const offWeekdays = [0, 1, 2, 3, 4, 5, 6].filter((w) => off[w] >= 2 && off[w] * 2 > seen[w]);
	return { mainShiftId, offWeekdays, planned: seen.some((n) => n > 0) };
}

const slotsOf = (shiftId: string | null, offs: readonly number[]): WeeklySlots =>
	[0, 1, 2, 3, 4, 5, 6].map((w) => (offs.includes(w) || shiftId === null ? null : shiftId));

/** Fit each team of the grid (teams in first-seen order). */
export function fitTeams(input: FitInput): TeamFit[] {
	const teams = new Map<string, GridPerson[]>();
	for (const p of input.people) teams.set(p.teamId, [...(teams.get(p.teamId) ?? []), p]);

	return [...teams].map(([teamId, people]) => {
		const read = people.map((p) => ({ person: p, ...readPerson(input.dates, p.cells) }));
		const working = read.filter((r) => r.mainShiftId !== null);
		const joined = input.joined?.get(teamId);
		const personalOnly = !joined && (input.personalGroups?.has(teamId) ?? false);
		const mainShiftId = joined
			? joined.mainShiftId
			: personalOnly
				? null
				: (mostCommon(
						working.map((r) => r.mainShiftId as string),
						(s) => s
					) ?? null);
		const onMain = read.filter((r) => r.mainShiftId === mainShiftId || r.mainShiftId === null);
		const offWeekdays = joined
			? [...joined.offWeekdays]
			: (mostCommon(
					onMain.filter((r) => r.planned).map((r) => r.offWeekdays),
					key
				) ?? []);
		const fit: TeamFit = {
			teamId,
			mainShiftId,
			joined: joined !== undefined,
			offWeekdays,
			slots: slotsOf(mainShiftId, offWeekdays),
			ownRules: [],
			personal: [],
			changes: [],
			swaps: [],
			unplanned: read.filter((r) => !r.planned).map((r) => r.person.staffId)
		};

		for (const r of read) {
			if (!r.planned) continue;
			const { staffId } = r.person;
			let expected: WeeklySlots;
			if (r.mainShiftId === null || (!personalOnly && r.mainShiftId === mainShiftId)) {
				if (key(r.offWeekdays) !== key(offWeekdays))
					fit.ownRules.push({ staffId, offWeekdays: r.offWeekdays });
				expected = slotsOf(mainShiftId, r.offWeekdays);
			} else {
				const shiftId = r.mainShiftId;
				let own = fit.personal.find(
					(p) => p.shiftId === shiftId && key(p.offWeekdays) === key(r.offWeekdays)
				);
				if (!own) {
					own = {
						shiftId,
						offWeekdays: r.offWeekdays,
						slots: slotsOf(shiftId, r.offWeekdays),
						staffIds: []
					};
					fit.personal.push(own);
				}
				own.staffIds.push(staffId);
				expected = own.slots;
			}
			const mine: DayChange[] = [];
			input.dates.forEach((date, i) => {
				const cell = r.person.cells[i];
				if (cell === undefined) return;
				if (cell !== expected[weekdayOf(date)]) mine.push({ staffId, date, shiftId: cell });
			});
			const paired = pairSelfSwaps(mine, expected);
			fit.swaps.push(...paired.swaps);
			fit.changes.push(...paired.changes);
		}
		return fit;
	});
}

/**
 * The saved pattern a group can join for `[from, next)` (RI11): exactly one assignment runs in the
 * month, it covers the whole month, and it is a weekly pattern with one shift on every work weekday.
 * Anything else (a cycle, two shifts, a change inside the month) stays refused.
 */
export function joinableAssignment(
	assignments: readonly Pick<
		RosterAssignment,
		'patternId' | 'type' | 'slots' | 'effectiveFrom' | 'effectiveTo'
	>[],
	from: string,
	next: string
): { patternId: string; mainShiftId: string; offWeekdays: number[] } | null {
	const running = assignments.filter(
		(a) => a.effectiveFrom < next && (a.effectiveTo === null || a.effectiveTo > from)
	);
	if (running.length !== 1) return null;
	const [a] = running;
	if (a.type !== 'weekly' || a.slots.length !== 7) return null;
	if (a.effectiveFrom > from || (a.effectiveTo !== null && a.effectiveTo < next)) return null;
	const shifts = new Set(a.slots.filter((s): s is string => s !== null));
	if (shifts.size !== 1) return null;
	return {
		patternId: a.patternId,
		mainShiftId: [...shifts][0],
		offWeekdays: [0, 1, 2, 3, 4, 5, 6].filter((w) => a.slots[w] === null)
	};
}

/** Sunday of the week that holds `date`. */
function weekOf(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - d.getUTCDay());
	return d.toISOString().slice(0, 10);
}

/**
 * One person's day changes → self swaps and what is left (OC4). A day off on a planned work day
 * pairs with a worked planned off day that works the same shift: the nearest in the same week,
 * else the first in the same month. Anything else stays a day edit.
 */
export function pairSelfSwaps(
	changes: readonly DayChange[],
	expected: WeeklySlots
): { swaps: SelfSwapFit[]; changes: DayChange[] } {
	const plannedOn = (date: string) => expected[weekdayOf(date)];
	const offs = changes.filter((c) => c.shiftId === null && plannedOn(c.date) !== null);
	const works = changes.filter((c) => c.shiftId !== null && plannedOn(c.date) === null);
	const used = new Set<string>();
	const swaps: SelfSwapFit[] = [];
	for (const off of [...offs].sort((a, b) => a.date.localeCompare(b.date))) {
		const shiftId = plannedOn(off.date) as string;
		const free = works.filter((w) => !used.has(w.date) && w.shiftId === shiftId);
		const sameWeek = free.filter((w) => weekOf(w.date) === weekOf(off.date));
		const sameMonth = free.filter((w) => w.date.slice(0, 7) === off.date.slice(0, 7));
		const match = sameWeek[0] ?? sameMonth[0];
		if (!match) continue;
		used.add(match.date);
		used.add(`off ${off.date}`);
		swaps.push({
			staffId: off.staffId,
			firstDate: off.date,
			secondDate: match.date,
			shiftId,
			scope: sameWeek[0] ? 'week' : 'month'
		});
	}
	const left = changes.filter((c) =>
		c.shiftId === null && plannedOn(c.date) !== null
			? !used.has(`off ${c.date}`)
			: !(c.shiftId !== null && plannedOn(c.date) === null && used.has(c.date))
	);
	return { swaps, changes: left };
}

/** A replay mismatch: the grid says `want`, the roster gives `got`. */
export type ReplayMismatch = {
	staffId: string;
	date: string;
	want: string | null;
	got: string | null;
};

/**
 * Add the fitted rows (one team assignment per team pattern, a personal assignment per person on a
 * personal pattern, own rules, day changes; all from the first date to the day after the last) to
 * `base` — the people's existing roster rows — and compare `rosterDay` with the grid on every
 * planned cell. `patternIds` names the patterns the save will create (team id, or
 * `${teamId} ${index}` for the team's personal patterns).
 */
export function replayFit(
	input: FitInput,
	fits: readonly TeamFit[],
	base: RosterData,
	patternIds: (teamId: string, personal: number | null) => string = (teamId, personal) =>
		personal === null ? `pattern ${teamId}` : `pattern ${teamId} ${personal}`,
	/** Where a group's pattern is assigned: its team (default) or a department. */
	targetOf: (groupId: string) => { teamId: string | null; departmentId: string | null } = (
		groupId
	) => ({ teamId: groupId, departmentId: null })
): ReplayMismatch[] {
	const from = input.dates[0];
	const last = input.dates.at(-1);
	if (!from || !last) return [];
	const next = new Date(`${last}T00:00:00Z`);
	next.setUTCDate(next.getUTCDate() + 1);
	const to = next.toISOString().slice(0, 10);

	const weekly = (
		id: string,
		patternId: string,
		slots: WeeklySlots,
		defaultWorkShiftId: string | null,
		teamId: string | null
	): RosterAssignment => ({
		id,
		patternId,
		teamId,
		departmentId: null,
		type: 'weekly',
		slots,
		defaultWorkShiftId,
		anchorDate: null,
		effectiveFrom: from,
		effectiveTo: to
	});
	const schedule = (offWeekdays: number[]): RosterSchedule => ({
		offWeekdays,
		crewStart: null,
		effectiveFrom: from,
		effectiveTo: to
	});

	// A joined group's pattern is already in `base` (RI11).
	const groupAssignments = fits
		.filter((f) => f.mainShiftId !== null && !f.joined)
		.map((f) => {
			const target = targetOf(f.teamId);
			return {
				...weekly(`group ${f.teamId}`, patternIds(f.teamId, null), f.slots, f.mainShiftId, null),
				...target
			};
		});
	const data: RosterData = {
		...base,
		teamAssignments: [
			...base.teamAssignments,
			...groupAssignments.filter((a) => a.teamId !== null)
		],
		departmentAssignments: [
			...base.departmentAssignments,
			...groupAssignments.filter((a) => a.departmentId !== null)
		],
		personalAssignments: [
			...base.personalAssignments,
			...fits.flatMap((f) =>
				f.personal.flatMap((p, index) =>
					p.staffIds.map((staffId) => ({
						...weekly(`personal ${staffId}`, patternIds(f.teamId, index), p.slots, p.shiftId, null),
						staffId
					}))
				)
			)
		],
		schedules: [
			...base.schedules,
			...fits.flatMap((f) =>
				f.ownRules.map((r) => ({ ...schedule(r.offWeekdays), staffId: r.staffId }))
			)
		],
		overrides: [
			...base.overrides,
			...fits.flatMap((f) =>
				f.changes.map((c) => ({
					staffId: c.staffId,
					shiftDate: c.date,
					shiftId: c.shiftId,
					swapGroupId: null
				}))
			),
			...fits.flatMap((f) =>
				f.swaps.flatMap((w) => [
					{
						staffId: w.staffId,
						shiftDate: w.firstDate,
						shiftId: null,
						swapGroupId: `swap ${w.staffId} ${w.firstDate}`
					},
					{
						staffId: w.staffId,
						shiftDate: w.secondDate,
						shiftId: w.shiftId,
						swapGroupId: `swap ${w.staffId} ${w.firstDate}`
					}
				])
			)
		]
	};

	const mismatches: ReplayMismatch[] = [];
	for (const person of input.people) {
		const roster = rosterInputOf(data, person.staffId);
		input.dates.forEach((date, i) => {
			const want = person.cells[i];
			if (want === undefined) return;
			const got = rosterDay(roster, date).shiftId;
			if (got !== want) mismatches.push({ staffId: person.staffId, date, want, got });
		});
	}
	return mismatches;
}
