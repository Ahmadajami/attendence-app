import { error } from '@sveltejs/kit';
import writeXlsxFile from 'write-excel-file/node';
import { m } from '#lib/paraglide/messages.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import { PUNCH_FILE_HEADERS } from '#lib/attendance/punch-import.js';
import { ROSTER_FILE_HEADERS, SHIFT_FILE_HEADERS } from '#lib/roster/roster-file.js';
import { todayInDamascus } from '#lib/server/time.js';
import { STAFF_COLUMNS, templateHeaders } from '#lib/server/imports/columns.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params, url, setHeaders }) => {
	requirePermission(locals, 'import.run');

	const kind = params.kind;
	if (kind !== 'staff' && kind !== 'punches' && kind !== 'shifts' && kind !== 'roster') {
		error(404, m.imports_error_invalid_kind(), { code: 'invalid_kind' });
	}

	// Punches: one line per punch part (a day with a break is two lines) or per full-day state.
	// Roster: the person, their department (else team), then this month's dates.
	const monthDates = () => {
		const today = todayInDamascus();
		const first = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
		const out: string[] = [];
		for (const d = first; d.getUTCMonth() === first.getUTCMonth(); d.setUTCDate(d.getUTCDate() + 1))
			out.push(d.toISOString().slice(0, 10));
		return out;
	};
	const headers =
		kind === 'shifts'
			? Object.values(SHIFT_FILE_HEADERS)
			: kind === 'roster'
				? [
						ROSTER_FILE_HEADERS.employeeNo,
						ROSTER_FILE_HEADERS.department,
						ROSTER_FILE_HEADERS.team,
						...monthDates()
					]
				: kind === 'punches'
					? [
							PUNCH_FILE_HEADERS.employeeNo,
							PUNCH_FILE_HEADERS.date,
							PUNCH_FILE_HEADERS.checkIn,
							PUNCH_FILE_HEADERS.checkOut,
							PUNCH_FILE_HEADERS.state
						]
					: templateHeaders(STAFF_COLUMNS);
	const base = `${kind}-import-template`;

	if (url.searchParams.get('format') === 'md') {
		const body = `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n`;
		setHeaders({
			'content-type': 'text/markdown; charset=utf-8',
			'content-disposition': `attachment; filename="${base}.md"`
		});
		return new Response(body);
	}

	const buffer = await writeXlsxFile([
		headers.map((value) => ({ value, fontWeight: 'bold' }))
	]).toBuffer();
	setHeaders({
		'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		'content-disposition': `attachment; filename="${base}.xlsx"`
	});
	return new Response(new Uint8Array(buffer));
};
