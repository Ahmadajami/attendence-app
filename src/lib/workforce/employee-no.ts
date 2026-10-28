// Employee numbers for new hires (plan D28). Pure helper; the BL reads the existing numbers and
// relies on the unique constraint (and a retry) for concurrent creates.

/** Numbers are digits only (template rule `staff_employee_no_digits`). */
export const EMPLOYEE_NO_PATTERN = /^[0-9]+$/;

/**
 * The next free number: one more than the highest existing number, never below `start`. Numbers of
 * deactivated people count too, so a number is never reused. Uses BigInt so long badges are safe.
 */
export function nextEmployeeNo(existing: readonly string[], start = 1000): string {
	let highest = BigInt(start) - 1n;
	for (const value of existing) {
		if (!EMPLOYEE_NO_PATTERN.test(value)) continue;
		const n = BigInt(value);
		if (n > highest) highest = n;
	}
	return (highest + 1n).toString();
}
