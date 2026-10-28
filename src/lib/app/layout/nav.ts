import AirplaneTiltIcon from 'phosphor-svelte/lib/AirplaneTiltIcon';
import GearSixIcon from 'phosphor-svelte/lib/GearSixIcon';
import SquaresFourIcon from 'phosphor-svelte/lib/SquaresFourIcon';
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
	{ path: '/flights', label: m.nav_flights, icon: AirplaneTiltIcon, permission: 'flight.read' },
	{ path: '/employees', label: m.nav_employees, icon: UsersThreeIcon },
	{ path: '/teams', label: m.nav_teams, icon: UsersFourIcon, permission: 'staff.write' },
	{ path: '/imports', label: m.nav_imports, icon: UploadSimpleIcon, permission: 'import.run' },
	{ path: '/admin/users', label: m.nav_users, icon: UserGearIcon, permission: 'user.manage' },
	{
		path: '/admin/settings',
		label: m.nav_settings,
		icon: GearSixIcon,
		permission: 'settings.manage'
	}
];
