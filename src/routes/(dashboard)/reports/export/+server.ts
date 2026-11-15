import writeXlsxFile from 'write-excel-file/node';
import { m } from '#lib/paraglide/messages.js';
import { parseTotalsParams, TOTALS_COLUMN_LABEL } from '#lib/reports/totals.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import type { Actor } from '#lib/server/services/common.js';
import { parseScope, parseStaffId } from '#lib/server/services/daily/daily.bl.js';
import { getTotals } from '#lib/server/services/reports/reports.bl.js';
import { personName } from '#lib/utils/locale.js';
import type { RequestHandler } from './$types';

// The Excel export of the totals report (task T1, decisions SP3, SP6): the same rows and columns
// as the page, from the same URL filters, sort and search (R1). Needs `staff.write`, like the page. Minutes and day
// counts are written as numbers, so Excel can sum and compare them.

export const GET: RequestHandler = async ({ locals, url, setHeaders }) => {
	const actor: Actor = {
		user: requirePermission(locals, 'staff.write'),
		permissions: locals.permissions
	};
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

	const sheet = [
		[
			{ value: m.staff_field_employee_no(), fontWeight: 'bold' as const },
			{ value: m.attendance_col_person(), fontWeight: 'bold' as const },
			...page.columns.map((column) => ({
				value: TOTALS_COLUMN_LABEL[column](),
				fontWeight: 'bold' as const
			}))
		],
		...page.rows.map((row) => [
			{ value: row.person.employeeNo, type: String },
			{ value: personName(row.person), type: String },
			...page.columns.map((column) => ({ value: row.totals[column], type: Number }))
		])
	];

	const buffer = await writeXlsxFile(sheet).toBuffer();
	setHeaders({
		'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		'content-disposition': `attachment; filename="attendance-totals-${page.from}-${page.to}.xlsx"`
	});
	return new Response(new Uint8Array(buffer));
};
