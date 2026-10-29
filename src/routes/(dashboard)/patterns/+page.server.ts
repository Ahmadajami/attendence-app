import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { failNotice } from '#lib/server/errors.js';
import { actorFrom } from '#lib/server/pattern-builder.js';
import {
	copyPattern,
	listPatterns,
	setPatternActive
} from '#lib/server/services/patterns/patterns.bl.js';
import { listShifts } from '#lib/server/services/shifts/shifts.bl.js';
import { listActiveDepartments } from '#lib/server/services/staff.js';
import { lookupName } from '#lib/utils/locale.js';
import type { Actions, PageServerLoad } from './$types';

const patternIdSchema = z.object({ patternId: z.uuid() });
const setActiveSchema = patternIdSchema.extend({ active: z.enum(['true', 'false']) });

export const load: PageServerLoad = async ({ locals, url }) => {
	const actor = actorFrom(locals);
	const [patterns, shifts, departments] = await Promise.all([
		listPatterns(actor),
		listShifts(actor),
		listActiveDepartments(actor)
	]);
	// `?department=` (a GET filter): patterns followed in that department.
	const department = url.searchParams.get('department');
	const filter = departments.some((d) => d.id === department) ? department : null;
	return {
		patterns: filter ? patterns.filter((p) => p.departmentIds.includes(filter)) : patterns,
		total: patterns.length,
		shifts,
		departments,
		department: filter,
		canManage: actor.permissions.has('roster.manage')
	};
};

export const actions: Actions = {
	copy: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const parsed = patternIdSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { notice: m.patterns_error_not_found() });
		try {
			const copy = await copyPattern(actor, parsed.data.patternId);
			return { notice: m.patterns_copied({ name: lookupName(copy) }) };
		} catch (cause) {
			return failNotice(cause);
		}
	},

	setActive: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const parsed = setActiveSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { notice: m.patterns_error_not_found() });
		const active = parsed.data.active === 'true';
		try {
			const row = await setPatternActive(actor, parsed.data.patternId, active);
			const name = lookupName(row);
			return {
				notice: active ? m.patterns_activated({ name }) : m.patterns_deactivated({ name })
			};
		} catch (cause) {
			return failNotice(cause);
		}
	}
};
