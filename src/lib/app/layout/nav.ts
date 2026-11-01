import BuildingsIcon from 'phosphor-svelte/lib/BuildingsIcon';
import CalendarDotsIcon from 'phosphor-svelte/lib/CalendarDotsIcon';
import ClockIcon from 'phosphor-svelte/lib/ClockIcon';
import FingerprintIcon from 'phosphor-svelte/lib/FingerprintIcon';
import GearSixIcon from 'phosphor-svelte/lib/GearSixIcon';
import SquaresFourIcon from 'phosphor-svelte/lib/SquaresFourIcon';
import TreeStructureIcon from 'phosphor-svelte/lib/TreeStructureIcon';
import UploadSimpleIcon from 'phosphor-svelte/lib/UploadSimpleIcon';
import UserGearIcon from 'phosphor-svelte/lib/UserGearIcon';
import UsersFourIcon from 'phosphor-svelte/lib/UsersFourIcon';
import UsersThreeIcon from 'phosphor-svelte/lib/UsersThreeIcon';
import type { AppPath } from '#lib/i18n.js';
import { m } from '#lib/paraglide/messages.js';
import type { PermissionKey } from '#lib/server/rbac/permissions.js';

export type NavItem = {
	path: AppPath;
	/** A function so the label follows the current locale. */
	label: () => string;
	icon: typeof SquaresFourIcon;
	/** Hide the link without this permission. Cosmetic only: the route checks it on the server. */
	permission?: PermissionKey;
};

/** Sidebar navigation for the `(dashboard)` area. */
export const dashboardNav: NavItem[] = [
	{ path: '/dashboard', label: m.nav_dashboard, icon: SquaresFourIcon },
	{
		path: '/departments',
		label: m.nav_departments,
		icon: BuildingsIcon,
		permission: 'staff.write'
	},
	{
		path: '/management',
		label: m.nav_management,
		icon: TreeStructureIcon,
		permission: 'staff.write'
	},
	{ path: '/employees', label: m.nav_employees, icon: UsersThreeIcon },
	{
		path: '/attendance/entry',
		label: m.nav_attendance_entry,
		icon: FingerprintIcon,
		permission: 'attendance.record'
	},
	{ path: '/teams', label: m.nav_teams, icon: UsersFourIcon, permission: 'staff.write' },
	{
		path: '/patterns',
		label: m.nav_patterns,
		icon: CalendarDotsIcon,
		permission: 'staff.write'
	},
	{ path: '/shifts', label: m.nav_shifts, icon: ClockIcon, permission: 'staff.write' },
	{ path: '/imports', label: m.nav_imports, icon: UploadSimpleIcon, permission: 'import.run' },
	{ path: '/admin/users', label: m.nav_users, icon: UserGearIcon, permission: 'user.manage' },
	{
		path: '/admin/settings',
		label: m.nav_settings,
		icon: GearSixIcon,
		permission: 'settings.manage'
	}
];
