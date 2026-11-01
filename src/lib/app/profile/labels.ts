import { m } from '#lib/paraglide/messages.js';
import { getLocale } from '#lib/paraglide/runtime.js';
import type { CustodyStatus, SocialPlatform } from '#lib/schemas/staff-profile.schema.js';
import { formatDate } from '#lib/utils/datetime.js';
import { formatExperience } from '#lib/workforce/profile.js';

const PLATFORM_LABELS: Record<SocialPlatform, () => string> = {
	facebook: m.profile_platform_facebook,
	instagram: m.profile_platform_instagram,
	linkedin: m.profile_platform_linkedin,
	x: m.profile_platform_x,
	telegram: m.profile_platform_telegram,
	whatsapp: m.profile_platform_whatsapp,
	tiktok: m.profile_platform_tiktok,
	other: m.profile_platform_other
};

/** A social platform's name; an unknown stored value shows as it is. */
export function platformLabel(platform: string): string {
	return PLATFORM_LABELS[platform as SocialPlatform]?.() ?? platform;
}

const LEVEL_LABELS: Record<string, () => string> = {
	'1': m.profile_skill_level_1,
	'2': m.profile_skill_level_2,
	'3': m.profile_skill_level_3
};

/** A skill level 1–3, or the "no level" text. */
export function levelLabel(level: number | string | null): string {
	return (
		(level === null || level === '' ? null : LEVEL_LABELS[String(level)]?.()) ??
		m.profile_skill_no_level()
	);
}

/** "3 years and 2 months" in the current locale, with the locale's plural forms. */
export function experienceText(totalMonths: number): string {
	const { years, months } = formatExperience(totalMonths);
	if (years === 0 && months === 0) return m.profile_experience_none();
	const unit = (unit: 'year' | 'month', value: number) =>
		new Intl.NumberFormat(getLocale(), { style: 'unit', unit, unitDisplay: 'long' }).format(value);
	const parts = [
		...(years ? [unit('year', years)] : []),
		...(months ? [unit('month', months)] : [])
	];
	return new Intl.ListFormat(getLocale(), { style: 'long', type: 'conjunction' }).format(parts);
}

/** "12 Jan 2020 – 3 Mar 2022", or "… – present" for an ongoing job. */
export function dateRange(from: string, to: string | null): string {
	return `${formatDate(from)} – ${to ? formatDate(to) : m.profile_experience_present()}`;
}

const CUSTODY_LABELS: Record<CustodyStatus, () => string> = {
	with_employee: m.profile_custody_status_with_employee,
	returned: m.profile_custody_status_returned,
	lost: m.profile_custody_status_lost,
	damaged: m.profile_custody_status_damaged
};

/** A custody status's name; an unknown stored value shows as it is. */
export function custodyStatusLabel(status: string): string {
	return CUSTODY_LABELS[status as CustodyStatus]?.() ?? status;
}

/** The employee page's tabs, in order (redesign plan V2); the value is `?tab=`. */
export const PROFILE_TABS = [
	'overview',
	'management',
	'schedule',
	'personal',
	'experience',
	'skills',
	'documents',
	'custody',
	'history'
] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

/** `?tab=` as a tab: an unknown value opens Overview, or Schedule when a day is asked for (V3). */
export function profileTab(value: string | null, hasDay: boolean): ProfileTab {
	if (value && (PROFILE_TABS as readonly string[]).includes(value)) return value as ProfileTab;
	return hasDay ? 'schedule' : 'overview';
}
