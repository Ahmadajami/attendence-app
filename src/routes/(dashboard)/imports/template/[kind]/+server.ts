import { error } from '@sveltejs/kit';
import writeXlsxFile from 'write-excel-file/node';
import { m } from '#lib/paraglide/messages.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import { FLIGHT_COLUMNS, STAFF_COLUMNS, templateHeaders } from '#lib/server/imports/columns.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params, url, setHeaders }) => {
	requirePermission(locals, 'import.run');

	const kind = params.kind;
	if (kind !== 'staff' && kind !== 'flights') {
		error(404, m.imports_error_invalid_kind(), { code: 'invalid_kind' });
	}

	const headers = templateHeaders(kind === 'staff' ? STAFF_COLUMNS : FLIGHT_COLUMNS);
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
