import { getLocale, getTextDirection } from '#lib/paraglide/runtime.js';

/** Sheets open from the inline end: physical `right` in LTR, `left` in RTL. */
export function endSide(): 'left' | 'right' {
	return getTextDirection(getLocale()) === 'rtl' ? 'left' : 'right';
}
/** Sheets open from the inline end: physical `right` in LTR, `left` in RTL. */
export function bottomSide(): 'bottom' {
	return 'bottom';
}

/** A person's preferred name in the current locale. */
export function personName(person: { fullName: string; fullNameAr?: string | null }): string {
	return getLocale() === 'ar' ? (person.fullNameAr ?? person.fullName) : person.fullName;
}

/** A team's preferred name in the current locale. */
export function teamName(row: { nameEn: string; nameAr: string }): string {
	return getLocale() === 'ar' ? row.nameAr : row.nameEn;
}

/** A lookup row's preferred name in the current locale. */
export function lookupName(row: { nameEn: string; nameAr: string }): string {
	return teamName(row);
}
