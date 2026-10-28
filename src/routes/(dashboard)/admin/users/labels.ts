import { m } from '#lib/paraglide/messages.js';
import { getLocale } from '#lib/paraglide/runtime.js';
import { endSide, personName } from '#lib/utils/locale.js';

export { endSide, personName };

/** Select options for code validity, in hours (matches `CODE_VALIDITY_HOURS`). */
export const VALIDITY_OPTIONS = ['24', '168', '720'] as const;

const VALIDITY_LABEL: Record<(typeof VALIDITY_OPTIONS)[number], () => string> = {
	'24': m.users_validity_24,
	'168': m.users_validity_168,
	'720': m.users_validity_720
};

export function validityLabel(value: string): string {
	return VALIDITY_LABEL[value as (typeof VALIDITY_OPTIONS)[number]]?.() ?? value;
}

export type RoleLabel = { key: string; nameEn: string; nameAr: string };

export function roleName(role: RoleLabel): string {
	return getLocale() === 'ar' ? role.nameAr : role.nameEn;
}
