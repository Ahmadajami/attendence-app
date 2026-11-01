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

/**
 * The status filter (management tree plan M22), kept in `?status=`. Shown only once someone is
 * inactive; `active` by default (Q-T6).
 */
export const EMPLOYEE_STATUSES = ['active', 'inactive', 'all'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export function employeeStatus(value: string | null): EmployeeStatus {
	return value && (EMPLOYEE_STATUSES as readonly string[]).includes(value)
		? (value as EmployeeStatus)
		: 'active';
}

/** The employees `status` shows. */
export function filterByStatus<T extends { active: boolean }>(
	employees: readonly T[],
	status: EmployeeStatus
): T[] {
	if (status === 'all') return [...employees];
	const active = status === 'active';
	return employees.filter((e) => e.active === active);
}

/** How many employees each status shows (from the whole list, not the filtered one). */
export function statusCounts(
	employees: readonly { active: boolean }[]
): Record<EmployeeStatus, number> {
	const active = employees.filter((e) => e.active).length;
	return { active, inactive: employees.length - active, all: employees.length };
}
