import { describe, expect, it } from 'vitest';
import { resolveOffDayConversion, type OffDayConversionVersion } from './conversion.js';

const version = (
	id: string,
	minutes: number | null,
	effectiveFrom: string,
	effectiveTo: string | null = null
): OffDayConversionVersion => ({ id, minutes, effectiveFrom, effectiveTo });

const DEFAULT_RESULT = { minutes: null, versionId: null, source: 'default' } as const;

describe('resolveOffDayConversion', () => {
	it('B2.3.C1: no versions → unset default', () => {
		expect(resolveOffDayConversion([], '2026-11-02')).toEqual(DEFAULT_RESULT);
	});

	it('B2.3.C2: a date before the first version → unset default', () => {
		const versions = [version('v1', 480, '2026-11-01')];
		expect(resolveOffDayConversion(versions, '2026-10-31')).toEqual(DEFAULT_RESULT);
	});

	it('B2.3.C3: a gap between two versions → unset default', () => {
		const versions = [
			version('v1', 480, '2026-11-01', '2026-11-10'),
			version('v2', 500, '2026-11-20')
		];
		expect(resolveOffDayConversion(versions, '2026-11-10')).toEqual(DEFAULT_RESULT);
		expect(resolveOffDayConversion(versions, '2026-11-19')).toEqual(DEFAULT_RESULT);
	});

	it('B2.3.C4: effectiveFrom inclusive, effectiveTo exclusive, open end', () => {
		const versions = [version('v1', 480, '2026-11-01', '2026-11-10')];
		expect(resolveOffDayConversion(versions, '2026-10-31')).toEqual(DEFAULT_RESULT);
		expect(resolveOffDayConversion(versions, '2026-11-01')).toEqual({
			minutes: 480,
			versionId: 'v1',
			source: 'company'
		});
		expect(resolveOffDayConversion(versions, '2026-11-09')).toEqual({
			minutes: 480,
			versionId: 'v1',
			source: 'company'
		});
		expect(resolveOffDayConversion(versions, '2026-11-10')).toEqual(DEFAULT_RESULT);
		const open = [version('v2', 500, '2026-11-10')];
		expect(resolveOffDayConversion(open, '2030-01-01')).toEqual({
			minutes: 500,
			versionId: 'v2',
			source: 'company'
		});
	});

	it('B2.3.C5: adjacent versions switch on their shared date', () => {
		const versions = [
			version('v1', 480, '2026-11-01', '2026-11-10'),
			version('v2', 500, '2026-11-10')
		];
		expect(resolveOffDayConversion(versions, '2026-11-09')).toMatchObject({
			minutes: 480,
			versionId: 'v1'
		});
		expect(resolveOffDayConversion(versions, '2026-11-10')).toMatchObject({
			minutes: 500,
			versionId: 'v2'
		});
	});

	it('B2.3.C6: an explicit clear keeps its own version id and company provenance', () => {
		const versions = [
			version('v1', 480, '2026-11-01', '2026-11-10'),
			version('v2', null, '2026-11-10')
		];
		expect(resolveOffDayConversion(versions, '2026-11-15')).toEqual({
			minutes: null,
			versionId: 'v2',
			source: 'company'
		});
	});

	it('B2.3.C7: fractional minutes 660.125 resolve unchanged', () => {
		const versions = [version('v1', 660.125, '2026-11-01')];
		const result = resolveOffDayConversion(versions, '2026-11-02');
		expect(result.minutes).toBe(660.125);
		expect(result).toEqual({ minutes: 660.125, versionId: 'v1', source: 'company' });
	});

	it('B2.3.C8: unsorted versions and a future version still resolve by date', () => {
		const versions = [
			version('v3', 520, '2026-12-01'),
			version('v1', 480, '2026-11-01', '2026-11-10'),
			version('v2', 500, '2026-11-10', '2026-12-01')
		];
		expect(resolveOffDayConversion(versions, '2026-11-05')).toMatchObject({ versionId: 'v1' });
		expect(resolveOffDayConversion(versions, '2026-11-20')).toMatchObject({ versionId: 'v2' });
		expect(resolveOffDayConversion(versions, '2026-12-15')).toMatchObject({ versionId: 'v3' });
		// The future version does not apply before it starts.
		expect(resolveOffDayConversion([versions[0]], '2026-11-20')).toEqual(DEFAULT_RESULT);
	});

	it('B2.3.C9: frozen fixtures are not mutated or reordered', () => {
		const versions = Object.freeze([
			Object.freeze(version('v2', 500, '2026-11-10', '2026-12-01')),
			Object.freeze(version('v1', 480, '2026-11-01', '2026-11-10'))
		]);
		expect(resolveOffDayConversion(versions, '2026-11-05')).toMatchObject({ versionId: 'v1' });
		expect(versions.map((v) => v.id)).toEqual(['v2', 'v1']);
		expect(versions[1].minutes).toBe(480);
	});
});
