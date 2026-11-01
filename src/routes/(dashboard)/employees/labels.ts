import type { StaffRow } from '#lib/types/workforce.js';

/** Droppable id of the "All employees" table; team tables use the team id. */
export const ALL_EMPLOYEES = 'all';

export { lookupName, personName as employeeName, teamName } from '#lib/utils/locale.js';

/** The page's tabs, kept in `?view=`: the employee cards, or moving people between teams. */
export const EMPLOYEE_VIEWS = ['cards', 'move'] as const;
export type EmployeeView = (typeof EMPLOYEE_VIEWS)[number];

export function employeeView(value: string | null): EmployeeView {
	return value && (EMPLOYEE_VIEWS as readonly string[]).includes(value)
		? (value as EmployeeView)
		: 'cards';
}

/** Employees whose number or name (English or Arabic) contains `query`. */
export function searchEmployees(employees: StaffRow[], query: string): StaffRow[] {
	const q = query.trim().toLocaleLowerCase();
	if (!q) return employees;
	return employees.filter(
		(e) =>
			e.employeeNo.includes(q) ||
			e.fullName.toLocaleLowerCase().includes(q) ||
			(e.fullNameAr?.includes(q) ?? false)
	);
}
