// The pattern builder, end to end, on the synthetic test DB (made-up team from seed.ts): build a
// pattern from a preset, assign it to a team from today, and see the member's preview follow it.
import { expect, test } from '@playwright/test';
import { E2E } from './seed.js';

test('a D D N N O O O O pattern assigned to a team shows in the member preview after a reload', async ({
	page
}) => {
	// A new name each run: pattern names are unique.
	const name = `E2E Day/Night ${Date.now()}`;

	// Step 1: names and type, from the 12 h day/night preset (needs the seeded D and N).
	await page.goto('/patterns/new');
	await page.getByLabel('Name (English)').fill(name);
	await page.getByLabel('Name (Arabic)').fill('نمط تجريبي');
	await page.getByRole('button', { name: '12 h day/night 2·2·4' }).click();
	await expect(page.getByText('42:00 h per week on average')).toBeVisible();

	// Step 3: assign to the made-up team from today; cycle day 1 is today.
	await page.getByLabel('Assign it now').click();
	await page.getByLabel(E2E.teamName).check();
	await page.getByLabel('Reason').fill('E2E: builder check');
	await page.getByRole('button', { name: 'Create pattern' }).click();
	await expect(page.getByText('Pattern saved and assigned.')).toBeVisible();
	await expect(page).toHaveURL(/\/patterns\/[0-9a-f-]{36}$/);

	// The pattern page lists the team as a follower; open the team.
	await page.getByRole('link', { name: new RegExp(E2E.teamName) }).click();
	await expect(page.getByRole('link', { name })).toBeVisible();

	// After a reload the member's preview (from today) follows D D N N O O O O.
	await page.reload();
	const row = page.getByRole('row', { name: new RegExp(E2E.personName) }).first();
	const cells = row.locator('td');
	const codes = ['D', 'D', 'N', 'N', 'O', 'O', 'O', 'O'];
	for (const [i, code] of codes.entries()) await expect(cells.nth(i)).toContainText(code);
});
