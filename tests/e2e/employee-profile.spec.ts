// The employee page redesign, end to end, on the synthetic test DB (made-up people only): add an
// employee on /employees/new with a job title created from the picker, land on the profile, give a
// skill created from the picker, hand out a custody item, and find it again after a reload.
import { expect, test, type Page } from '@playwright/test';

/** Choose "New …" in a picker and create the item in the sheet that opens over the form. */
async function createFromPicker(page: Page, picker: string, newLabel: string, nameEn: string) {
	await page.getByLabel(picker).click();
	await page.getByRole('option', { name: newLabel }).click();
	const sheet = page.getByRole('dialog', { name: newLabel });
	await sheet.getByLabel('Name (English)').fill(nameEn);
	await sheet.getByLabel('Name (Arabic)').fill('عنصر تجريبي');
	await sheet.getByRole('button', { name: 'Add' }).click();
	await expect(page.getByText(`${nameEn} was added.`)).toBeVisible();
	// The new item is selected in the picker.
	await expect(page.getByLabel(picker)).toHaveText(nameEn);
}

test('add an employee, then a skill and a custody item created from the pickers', async ({
	page
}) => {
	// New names each run: list items are unique by English name.
	const run = Date.now();
	const title = `E2E Title ${run}`;
	const skill = `E2E Skill ${run}`;
	const item = `E2E Radio ${run}`;

	// /employees → Add employee opens the new page.
	await page.goto('/employees');
	await page.getByRole('link', { name: 'Add employee' }).click();
	await expect(page).toHaveURL(/\/employees\/new$/);

	await page.getByLabel('First name (English)').fill('Sam');
	await page.getByLabel('Last name (English)').fill('Example');
	await page.getByLabel('First name (Arabic)').fill('سامي');
	await page.getByLabel('Last name (Arabic)').fill('مثال');
	// Required on create (create plan C2): ID number and start date (made-up values).
	await page.getByLabel('ID number').fill('00000000001');
	await page.getByLabel('Start date').fill('2026-01-01');
	// The avatar preview follows the typed names.
	await expect(page.getByText('SE', { exact: true })).toBeVisible();

	await createFromPicker(page, 'Job title', 'New job title', title);

	await page.getByRole('button', { name: 'Save employee' }).click();
	await expect(page.getByText('Sam Example was added.')).toBeVisible();
	await expect(page).toHaveURL(/\/employees\/[0-9a-f-]{36}\?tab=personal$/);
	await expect(page.getByRole('tab', { name: 'Personal' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(page.getByText(title).first()).toBeVisible();

	// Skills tab: add a skill created from the picker.
	await page.getByRole('tab', { name: 'Skills' }).click();
	await expect(page).toHaveURL(/\?tab=skills$/);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	const skillSheet = page.getByRole('dialog', { name: 'Add a skill' });
	await expect(skillSheet).toBeVisible();
	await createFromPicker(page, 'Skill', 'New skill', skill);
	await skillSheet.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Saved.')).toBeVisible();
	await expect(page.getByRole('listitem').filter({ hasText: skill })).toBeVisible();

	// Custody tab: hand out an item created from the picker.
	await page.getByRole('tab', { name: 'Custody' }).click();
	await page.getByRole('button', { name: 'Hand out an item' }).click();
	const custodySheet = page.getByRole('dialog', { name: 'Hand out an item' });
	await expect(custodySheet).toBeVisible();
	await createFromPicker(page, 'Item', 'New custody item', item);
	await custodySheet.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Saved.').last()).toBeVisible();

	// A reload keeps the tab and shows the item.
	await page.reload();
	await expect(page).toHaveURL(/\?tab=custody$/);
	await expect(page.getByRole('listitem').filter({ hasText: item })).toBeVisible();
});
