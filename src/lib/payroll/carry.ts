// What a pattern copy keeps of its source's pay settings (pay plan PR14). Pure: no DB or SvelteKit.
// "Copy" carries them from today, "change from a date" from its date: the pay-rule versions in force
// on or after that date and the active holidays not yet over, each moved to start on the date at
// the earliest (the copy plans nobody's days before it).

type Version = { effectiveFrom: string; effectiveTo: string | null };
type Holiday = { startsOn: string; endsOn: string; cancelledAt: Date | string | null };

export type CarriedPaySettings<V extends Version, H extends Holiday> = {
	versions: V[];
	holidays: H[];
};

const later = (a: string, b: string) => (a > b ? a : b);

export function carryPaySettings<V extends Version, H extends Holiday>(
	versions: readonly V[],
	holidays: readonly H[],
	from: string
): CarriedPaySettings<V, H> {
	return {
		versions: versions
			.filter((v) => v.effectiveTo === null || v.effectiveTo > from)
			.map((v) => ({ ...v, effectiveFrom: later(v.effectiveFrom, from) })),
		holidays: holidays
			.filter((h) => h.cancelledAt === null && h.endsOn >= from)
			.map((h) => ({ ...h, startsOn: later(h.startsOn, from) }))
	};
}
