import { z } from 'zod';

/** The value schema of each `app_setting` key; the column's stored type comes from these. */
export const appSettingSchemas = {} as const satisfies Record<string, z.ZodType>;

export type SettingKey = keyof typeof appSettingSchemas;
export type SettingValues = { [K in SettingKey]: z.infer<(typeof appSettingSchemas)[K]> };
export type SettingValue = SettingValues[SettingKey];
