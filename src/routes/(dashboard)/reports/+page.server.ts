import { requirePermission } from '#lib/server/rbac/guard.js';
import type { Actor } from '#lib/server/services/common.js';
import { parseScope, parseStaffId } from '#lib/server/services/daily/daily.bl.js';
import { parseTotalsDir, parseTotalsParams } from '#lib/reports/totals.js';
import { getPersonDays, getTotals } from '#lib/server/services/reports/reports.bl.js';
import type { PageServerLoad } from './$types';

// The totals report `/reports` (task T1, decisions SP3, SP6). The filters live in the URL (a GET
// form), so the page survives a reload and the Excel export reuses them. Viewing needs
// `staff.write`, the same permission as the daily page; the service does no writes.

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'staff.write'), permissions: locals.permissions };
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const actor = actorFrom(locals);
	const { from, to, sort, q, cap, columns } = parseTotalsParams(url.searchParams);
	const page = await getTotals(actor, {
		from,
		to,
		scope: parseScope(url.searchParams.get('scope')),
		columns,
		sort,
		q,
		cap,
		staffId: parseStaffId(url.searchParams.get('staff'))
	});
	// The person sheet (R2): `person=<id>` opens it, `pdir` sorts its days; same dates and scope.
	const staffId = parseStaffId(url.searchParams.get('person'));
	const personSheet = staffId
		? await getPersonDays(actor, {
				staffId,
				from: page.from,
				to: page.to,
				scope: page.scope,
				dir: parseTotalsDir(url.searchParams.get('pdir'))
			})
		: null;
	return { page, personSheet };
};
