// Starting shapes for the pattern builder (builder plan B12, mockup "Pattern builder"). A shape names
// shifts by code, so it only works where those shifts exist; `*` is the shift picked as the brush
// (the weekly shapes fit any working shift). Client-safe.

import type { PatternType } from '#lib/schemas/enums.js';

/** A shift code, `O` for off, or `*` for the brush shift. */
type ShapeSlot = string;

export type Preset = {
	/** Message key suffix: `patterns_preset_<key>`. */
	key: string;
	type: PatternType;
	shape: readonly ShapeSlot[];
};

export const PRESETS: readonly Preset[] = [
	{ key: 'office_sun_thu', type: 'weekly', shape: ['*', '*', '*', '*', '*', 'O', 'O'] },
	{ key: 'six_on_one_off', type: 'weekly', shape: ['*', '*', '*', '*', '*', 'O', '*'] },
	{ key: 'day_night_2_2_4', type: 'cycle', shape: ['D', 'D', 'N', 'N', 'O', 'O', 'O', 'O'] },
	{ key: 'nights_4_on_4_off', type: 'cycle', shape: ['N', 'N', 'N', 'N', 'O', 'O', 'O', 'O'] },
	{ key: 'days_4_on_4_off', type: 'cycle', shape: ['D', 'D', 'D', 'D', 'O', 'O', 'O', 'O'] }
];

/** `missing` lists the codes to create first, `*` when no brush shift is picked. */
export type PresetResult = { type: PatternType; slots: (string | null)[] } | { missing: string[] };

/**
 * A preset's slots with the shifts that exist: `shifts` are the active ones (code → id), `brush` the
 * picked shift id (`null`: none, or off).
 */
export function resolvePreset(
	preset: Preset,
	shifts: readonly { id: string; code: string }[],
	brush: string | null
): PresetResult {
	const byCode = new Map(shifts.map((s) => [s.code, s.id]));
	const missing = new Set<string>();
	const slots = preset.shape.map((slot) => {
		if (slot === 'O') return null;
		const id = slot === '*' ? brush : (byCode.get(slot) ?? null);
		if (id === null) missing.add(slot);
		return id;
	});
	if (missing.size > 0) return { missing: [...missing] };
	return { type: preset.type, slots };
}
