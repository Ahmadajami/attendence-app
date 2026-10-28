import type { ShiftPattern } from '#lib/server/db/schema/index.js';

type Span = Pick<ShiftPattern, 'effectiveFrom' | 'effectiveTo'>;

/**
 * What saving a new cycle version from `from` does to one owner's versions (a team, or a person).
 * Versions are never edited in place (ROSTER_PLAN.md):
 * - `closed`: the version in force on `from`, which now ends there (`effective_to = from`);
 * - `removed`: versions starting on or after `from`. `from` is today or later, so they are
 *   scheduled changes the new version replaces.
 * The new version is open-ended. Used by the roster service and by the editor's live preview.
 */
export function planVersionChange<T extends Span>(
	versions: readonly T[],
	from: string
): { closed: T | null; removed: T[] } {
	return {
		closed:
			versions.find(
				(v) => v.effectiveFrom < from && (v.effectiveTo === null || v.effectiveTo > from)
			) ?? null,
		removed: versions.filter((v) => v.effectiveFrom >= from)
	};
}

/** The owner's versions once `next` is saved (for previews). */
export function applyVersionChange<T extends Span>(versions: readonly T[], next: T): T[] {
	const { closed, removed } = planVersionChange(versions, next.effectiveFrom);
	return [
		...versions
			.filter((v) => !removed.includes(v))
			.map((v) => (v === closed ? { ...v, effectiveTo: next.effectiveFrom } : v)),
		next
	];
}
