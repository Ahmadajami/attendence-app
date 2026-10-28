// Playwright global setup: made-up data in the synthetic test DB, the same on every run. It
// refuses any database but `attendance_app_test`. Never put real people here.
import postgres from 'postgres';

export const E2E = {
	adminLoginId: '9000',
	adminName: 'E2E Admin',
	employeeNo: '990001',
	personName: 'E2E Night Worker',
	teamName: 'E2E Night Team'
} as const;

export default async function seed(): Promise<void> {
	const url = process.env.E2E_DATABASE_URL ?? '';
	if (!/\/attendance_app_test(\?|$)/.test(url))
		throw new Error('seed.ts only writes to attendance_app_test.');
	const sql = postgres(url, { max: 1 });
	try {
		await sql.begin(async (tx) => {
			// The local-mode account: the oldest active admin. Its code is never used (no sign-in).
			await tx`
				INSERT INTO "user" (login_id, full_name, role_id, password_hash)
				SELECT ${E2E.adminLoginId}, ${E2E.adminName}, r.id, 'e2e-no-sign-in'
				FROM role r WHERE r.key = 'admin'
				ON CONFLICT (login_id) DO NOTHING`;

			const [team] = await tx`
				INSERT INTO team (name_en, name_ar) VALUES (${E2E.teamName}, 'فريق تجريبي ليلي')
				ON CONFLICT DO NOTHING RETURNING id`;
			const teamId =
				team?.id ?? (await tx`SELECT id FROM team WHERE name_en = ${E2E.teamName}`)[0].id;

			let [person] = await tx`SELECT id FROM staff WHERE employee_no = ${E2E.employeeNo}`;
			if (!person) {
				[person] = await tx`
					INSERT INTO staff (employee_no, full_name, team_id)
					VALUES (${E2E.employeeNo}, ${E2E.personName}, ${teamId}) RETURNING id`;
				await tx`
					INSERT INTO staff_team_membership (staff_id, team_id, valid_from)
					VALUES (${person.id}, ${teamId}, '2025-12-31T21:00:00Z')`;
			}

			// The team works N every day.
			await tx`
				INSERT INTO shift_pattern (team_id, type, slots, anchor_date, effective_from, reason)
				SELECT ${teamId}, 'cycle', ARRAY[s.id], '2026-01-01', '2026-01-01', 'e2e seed'
				FROM shift s WHERE s.code = 'N'
				AND NOT EXISTS (SELECT 1 FROM shift_pattern WHERE team_id = ${teamId})`;

			// Start each run without the previous run's punches (test DB only): corrections first.
			await tx`DELETE FROM attendance_event WHERE staff_id = ${person.id} AND corrects_event_id IS NOT NULL`;
			await tx`DELETE FROM attendance_event WHERE staff_id = ${person.id}`;
		});
	} finally {
		await sql.end();
	}
}
