import { randomUUID } from 'node:crypto';
import { expect, test, type Request } from '@playwright/test';
import postgres from 'postgres';
import { E2E } from './seed.js';

const from = '2026-02-01';
const to = '2026-05-20';
const friday = '2026-02-06';

test('Daily bulk state review, sparse replacement, stale save and Arabic clear', async ({
	page,
	request
}) => {
	test.setTimeout(90_000);
	const url = process.env.E2E_DATABASE_URL ?? '';
	if (!/\/attendance_app_test(\?|$)/.test(url)) throw new Error('Synthetic test database required');
	const sql = postgres(url, { max: 1 });
	try {
		const [person] = await sql`
			insert into staff (employee_no, full_name, full_name_ar, team_id)
			select '990090', 'E2E Bulk Worker', 'موظف تجريبي', id from team where name_en = ${E2E.teamName}
			on conflict (employee_no) do update set active = true returning id, team_id
		`;
		const id = person.id as string;
		await sql.begin(async (tx) => {
			await tx`
				insert into staff_team_membership (staff_id, team_id, valid_from)
				select ${id}, ${person.team_id}, '2025-12-31T21:00:00Z'
				where not exists (select 1 from staff_team_membership where staff_id = ${id})
			`;
			await tx`update absence set cancelled_at=now() where staff_id=${id} and cancelled_at is null`;
			await tx`delete from attendance_event where staff_id=${id}`;
			await tx`
				insert into attendance_event (staff_id, shift_date, type, occurred_at)
				values (${id}, ${friday}, 'check_in', '2026-02-06T22:00:00+03:00'),
					(${id}, ${friday}, 'check_out', '2026-02-07T06:00:00+03:00')
			`;
			await tx`
				insert into absence (staff_id, starts_on, ends_on, type, reason)
				values (${id}, '2026-02-05', '2026-02-09', 'leave', 'Synthetic leave')
			`;
			await tx`
				insert into absence (staff_id, starts_on, ends_on, type, pattern_id, group_id)
				select ${id}, '2026-02-10', '2026-02-10', 'mission', p.id, ${randomUUID()}
				from pattern p where p.name_en = 'E2E N every day'
			`;
		});
		const filter = `staff=${id}&from=${from}&to=${to}`;
		const daily = '/attendance/days';
		await page.goto(`${daily}?${filter}`);
		const recomputed = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' && response.url().includes('recomputeDays')
		);
		await page.getByRole('button', { name: 'Recompute these days' }).click();
		expect((await recomputed).ok()).toBeTruthy();

		const dialog = page.getByRole('dialog');
		const change = page.getByRole('button', { name: 'Change state', exact: true });
		const selectPage = page.getByRole('checkbox', { name: 'Select this page' });
		const selectDay = (date: string) =>
			page.getByRole('checkbox', { name: `Select E2E Bulk Worker on ${date}` });
		const review = dialog.getByRole('button', { name: 'Review changes' });
		const apply = dialog.getByRole('button', { name: 'Apply changes' });

		await selectPage.click();
		await expect(page.getByText('100 selected')).toBeVisible();
		await selectDay('May 20, 2026').click();
		await expect(page.getByText('99 selected')).toBeVisible();
		await page.getByRole('button', { name: 'Next page' }).click();
		await expect(change).toBeDisabled();
		await page.goto(`${daily}?staff=${id}&from=2026-05-19&to=${to}`);
		const forged = await request.post(`${page.url()}&/reviewBulkState`, {
			headers: {
				origin: new URL(page.url()).origin,
				accept: 'application/json',
				'x-sveltekit-action': 'true'
			},
			form: {
				payload: JSON.stringify({
					targets: [{ staffId: id, shiftDate: friday }],
					reason: 'Synthetic review',
					operation: 'leave'
				})
			}
		});
		expect(await forged.json()).toMatchObject({ type: 'failure', status: 409 });
		await selectPage.click();
		await selectDay('May 20, 2026').click();
		await change.click();
		await dialog.getByRole('combobox', { name: 'State' }).click();
		await page.getByRole('option', { name: 'Leave', exact: true }).click();
		await dialog.getByLabel('Reason', { exact: true }).fill('Synthetic bulk leave');
		await review.click();
		await expect(dialog.getByText('1 to change · 0 unchanged · 0 blocked')).toBeVisible();
		await apply.click();
		await expect(dialog).toBeHidden();
		const may = await sql`
			select absence_type
			from day_result where staff_id=${id} and shift_date between '2026-05-19' and '2026-05-20'
			order by shift_date
		`;
		expect(may.map((row) => row.absence_type)).toEqual(['leave', null]);

		await page.goto(`${daily}?staff=${id}&from=2026-02-05&to=2026-02-10`);
		await selectDay('Feb 6, 2026').click();
		await selectDay('Feb 8, 2026').click();
		await selectDay('Feb 10, 2026').click();
		await change.click();
		await dialog.getByRole('combobox', { name: 'State' }).click();
		await page.getByRole('option', { name: 'Leave', exact: true }).click();
		await dialog.getByLabel('Reason', { exact: true }).fill('Synthetic replacement');
		await review.click();
		await expect(dialog.getByText('0 to change · 2 unchanged · 1 blocked')).toBeVisible();
		await expect(dialog.getByText('Managed by a pattern mission.')).toBeVisible();
		await expect(apply).toBeDisabled();
		await dialog.getByRole('button', { name: /Remove E2E Bulk Worker/ }).click();
		await dialog.getByRole('combobox', { name: 'State' }).click();
		await page.getByRole('option', { name: 'Sick', exact: true }).click();
		await review.click();
		await expect(dialog.getByText('2 to change · 0 unchanged · 0 blocked')).toBeVisible();
		await expect(dialog.getByText(/· Punches recorded/)).toBeVisible();
		await sql`
			insert into attendance_event (staff_id, shift_date, type, occurred_at)
			values (${id}, '2026-02-08', 'check_in', '2026-02-08T22:00:00+03:00')
		`;
		await apply.click();
		await expect(
			page.getByText('Attendance or the current page changed.', { exact: false })
		).toBeVisible();
		await expect(apply).toBeDisabled();

		await review.click();
		await expect(apply).toBeEnabled();
		const auditCount = async () => {
			const [row] = await sql`
				select count(*)::int as count from audit_log
				where action='day_state.bulk'
					and after->'days' @> ${sql.json([{ staffId: id, shiftDate: friday }])}
			`;
			return row.count;
		};
		const before = await auditCount();
		await sql.unsafe(`
			alter table day_result add constraint e2e_bulk_reject_flag check (
				staff_id <> '${id}' or shift_date <> '2026-02-08' or not needs_recompute
			) not valid
		`);
		try {
			const rejected = page.waitForResponse(
				(response) =>
					response.request().method() === 'POST' && response.url().includes('applyBulkState')
			);
			await apply.click();
			const response = await rejected;
			expect(response.status()).toBe(500);
			expect(await response.json()).toMatchObject({ type: 'error' });
			expect(await auditCount()).toBe(before);
			const [original] = await sql`
				select starts_on::text, ends_on::text, type from absence
				where staff_id=${id} and cancelled_at is null and starts_on <= ${friday} and ends_on >= ${friday}
			`;
			expect(original).toMatchObject({
				starts_on: '2026-02-05',
				ends_on: '2026-02-09',
				type: 'leave'
			});
		} finally {
			await sql`alter table day_result drop constraint e2e_bulk_reject_flag`;
		}

		const submit = page.waitForRequest(
			(posted) => posted.method() === 'POST' && posted.url().includes('applyBulkState')
		);
		await apply.click();
		const submitted = await submit;
		await expect(dialog).toBeHidden();
		const repeat = (submitted: Request) =>
			request.post(submitted.url(), {
				headers: {
					'content-type': submitted.headers()['content-type'],
					origin: new URL(submitted.url()).origin,
					accept: 'application/json',
					'x-sveltekit-action': 'true'
				},
				data: submitted.postDataBuffer()!
			});
		const replay = await repeat(submitted);
		expect(await replay.json()).toMatchObject({ type: 'failure', status: 409 });
		expect(await auditCount()).toBe(before + 1);
		const [permission] = await sql`
			delete from role_permission rp using role r, permission p
			where rp.role_id=r.id and rp.permission_id=p.id
				and r.key='admin' and p.key='attendance.record'
			returning rp.role_id, rp.permission_id
		`;
		try {
			expect(permission).toBeDefined();
			const denied = await repeat(submitted);
			expect(await denied.json()).toMatchObject({ type: 'failure', status: 403 });
		} finally {
			if (permission)
				await sql`insert into role_permission ${sql(permission)} on conflict do nothing`;
		}
		const states = await sql`
			select starts_on::text as date, type from absence
			where staff_id=${id} and starts_on between '2026-02-05' and '2026-02-10'
				and cancelled_at is null order by starts_on
		`;
		expect(states.map((row) => row.type)).toEqual([
			'leave',
			'sick',
			'leave',
			'sick',
			'leave',
			'mission'
		]);
		const matchingLogs = await sql`
			select shift_date::text, cause_id, new_value from attendance_log
			where staff_id=${id} and shift_date in ('2026-02-06', '2026-02-08')
				and source='day_edit' and cause_type='absence' and field='state'
			order by at desc limit 2
		`;
		expect(matchingLogs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ shift_date: '2026-02-06', new_value: 'sick' }),
				expect.objectContaining({ shift_date: '2026-02-08', new_value: 'sick' })
			])
		);
		expect(matchingLogs[0].cause_id).not.toBe(matchingLogs[1].cause_id);

		await page.goto(`/ar${daily}?staff=${id}&from=${friday}&to=${friday}`);
		await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
		const arabicSelect = page.getByRole('checkbox', { name: 'تحديد هذه الصفحة' });
		await arabicSelect.focus();
		await page.keyboard.press('Space');
		const arabicChange = page.getByRole('button', { name: 'تغيير الحالة', exact: true });
		await arabicChange.focus();
		await page.keyboard.press('Enter');
		await dialog.getByRole('combobox').click();
		await page.getByRole('option', { name: 'مسح الحالة' }).click();
		await dialog.getByLabel('السبب', { exact: true }).fill('تصحيح إداري تجريبي');
		await dialog.getByRole('button', { name: 'مراجعة التغييرات' }).click();
		await expect(dialog.getByText('توجد بصمات مسجّلة')).toBeVisible();
		await sql.unsafe(`
			alter table day_result add constraint e2e_bulk_reject_recompute check (
				staff_id <> '${id}' or shift_date <> '${friday}' or absence_type is not null
			) not valid
		`);
		const arabicApply = '**/ar/attendance/days?*&/applyBulkState';
		let repairPending = false;
		try {
			await page.route(
				arabicApply,
				async (route) => {
					const result = await route.fetch();
					const [row] = await sql`
					select needs_recompute from day_result where staff_id=${id} and shift_date=${friday}
				`;
					repairPending = row.needs_recompute;
					await sql`alter table day_result drop constraint e2e_bulk_reject_recompute`;
					await route.fulfill({ response: result });
				},
				{ times: 1 }
			);
			await dialog.getByRole('button', { name: 'تطبيق التغييرات' }).click();
			await expect(dialog).toBeHidden();
		} finally {
			await page.unroute(arabicApply);
			await sql`alter table day_result drop constraint if exists e2e_bulk_reject_recompute`;
		}
		expect(repairPending).toBe(true);
		const [fridayResult] = await sql`
			select absence_type, worked_minutes, check_out at time zone 'Asia/Damascus' as check_out
			from day_result where staff_id=${id} and shift_date=${friday}
		`;
		expect(fridayResult).toMatchObject({ absence_type: null, worked_minutes: 480 });
		expect(fridayResult.check_out).toBeTruthy();
		const [saturday] = await sql`
			select absence_type from day_result where staff_id=${id} and shift_date='2026-02-07'
		`;
		expect(saturday.absence_type).toBe('leave');
		expect(new URL(page.url()).searchParams.get('from')).toBe(friday);
		await page.getByRole('button', { name: 'تعديل اليوم', exact: true }).click();
		await expect(dialog).toBeVisible();
	} finally {
		await sql.end();
	}
});
