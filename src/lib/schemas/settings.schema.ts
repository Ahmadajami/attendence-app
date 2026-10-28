import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';

/** `HH:mm` (00:00–23:59), a Damascus wall-clock time. */
const wallClockTime = z
	.string()
	.regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, { error: () => m.settings_time_invalid() });

/** Starts of the 12 h Day and Night shifts, entered by the admin; each shift ends 12 h later. */
export const shiftStartsSchema = z
	.object({ day: wallClockTime, night: wallClockTime })
	.refine((v) => v.day !== v.night, {
		error: () => m.settings_shift_starts_same(),
		path: ['night']
	});
export type ShiftStartsSchema = typeof shiftStartsSchema;
export type ShiftStarts = z.infer<ShiftStartsSchema>;

/** The value schema of each `app_setting` key; the column's stored type comes from these. */
export const appSettingSchemas = {
	'roster.shift_starts': shiftStartsSchema
} as const;

export type SettingKey = keyof typeof appSettingSchemas;
export type SettingValues = { [K in SettingKey]: z.infer<(typeof appSettingSchemas)[K]> };
export type SettingValue = SettingValues[SettingKey];

/** Superforms status message of the settings page. */
export type SettingsMessage = { kind: 'success' | 'error'; text: string };
