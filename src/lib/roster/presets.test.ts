import { describe, expect, it } from 'vitest';
import { PRESETS, resolvePreset } from './presets.js';

const preset = (key: string) => {
	const found = PRESETS.find((p) => p.key === key);
	if (!found) throw new Error(`no preset ${key}`);
	return found;
};

// The seeded D and N, by made-up ids.
const DN = [
	{ id: 'id-d', code: 'D' },
	{ id: 'id-n', code: 'N' }
];

describe('resolvePreset (B12)', () => {
	it('maps codes to the shifts that exist', () => {
		expect(resolvePreset(preset('day_night_2_2_4'), DN, null)).toEqual({
			type: 'cycle',
			slots: ['id-d', 'id-d', 'id-n', 'id-n', null, null, null, null]
		});
	});

	it('fills a weekly shape with the brush shift', () => {
		expect(resolvePreset(preset('office_sun_thu'), DN, 'id-n')).toEqual({
			type: 'weekly',
			slots: ['id-n', 'id-n', 'id-n', 'id-n', 'id-n', null, null]
		});
	});

	it('names the codes to create first, or the missing brush', () => {
		expect(resolvePreset(preset('nights_4_on_4_off'), [DN[0]], null)).toEqual({ missing: ['N'] });
		expect(resolvePreset(preset('six_on_one_off'), DN, null)).toEqual({ missing: ['*'] });
	});

	it('has a key, a type and a valid length for every preset', () => {
		expect(new Set(PRESETS.map((p) => p.key)).size).toBe(PRESETS.length);
		for (const p of PRESETS) {
			if (p.type === 'weekly') expect(p.shape).toHaveLength(7);
			else expect(p.shape.length).toBeGreaterThanOrEqual(1);
			expect(p.shape.some((s) => s !== 'O')).toBe(true);
		}
	});
});
