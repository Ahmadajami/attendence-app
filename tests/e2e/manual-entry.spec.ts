// Manual punch entry, end to end, on the synthetic test DB (made-up people from seed.ts).
import { expect, test } from '@playwright/test';
import { E2E } from './seed.js';

/** A shift date two days ago in Damascus, so a 19:00 → 07:00 night is wholly in the past. */
function shiftDate(): string {
	const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Damascus' }).format(new Date());
	return new Date(Date.parse(`${today}T00:00:00Z`) - 2 * 86_400_000).toISOString().slice(0, 10);
}

test('a night entered as 19:00 → 07:00 stays on its shift date; a correction keeps the original', async ({
	page
}) => {
	const date = shiftDate();

	// Entry sheet for the made-up team on that date.
	await page.goto(`/attendance/entry?date=${date}`);
	await page.getByLabel('Department or team').selectOption({ label: E2E.teamName });
	await expect(page).toHaveURL(/scope=team%3A|scope=team:/);

	const checkIn = page.getByLabel(`Check-in of ${E2E.personName}`);
	const checkOut = page.getByLabel(`Check-out of ${E2E.personName}`);
	await checkIn.fill('1900');
	await checkOut.fill('0700');
	await checkOut.blur();
	await expect(checkIn).toHaveValue('19:00');
	await expect(checkOut).toHaveValue('07:00');
	await expect(page.getByText('+1 day')).toBeVisible();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText(/Saved: 2 punches/)).toBeVisible();

	// After a reload the pair is listed read-only on the row, with its next-day check-out.
	await page.reload();
	await expect(page.getByText(/19:00\s*→\s*07:00\s*\+1/)).toBeVisible();

	// The employee page opens the day panel of that shift date (not the next day): 12:00 worked.
	await page.getByRole('link', { name: 'Correct…' }).click();
	await expect(page.getByText('Worked 12:00')).toBeVisible();

	// Correct the check-out to 07:30 with a reason.
	const checkOutItem = page.locator('li', { hasText: 'Check-out' }).first();
	await checkOutItem.getByRole('button', { name: 'Correct' }).click();
	await checkOutItem.getByLabel('New time').fill('07:30');
	await checkOutItem.getByLabel('Reason').fill('E2E: left later than typed');
	await checkOutItem.getByRole('button', { name: 'Save correction' }).click();
	await expect(page.getByText('Correction saved; the original is kept.')).toBeVisible();

	// After a reload: 12:30 worked, the original 07:00 struck through with the reason.
	await page.reload();
	await expect(page.getByText('Worked 12:30')).toBeVisible();
	await expect(page.locator('.line-through', { hasText: '07:00' })).toBeVisible();
	await expect(page.getByText('E2E: left later than typed')).toBeVisible();
});
