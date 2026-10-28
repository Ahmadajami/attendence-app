import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { appSetting } from '#lib/server/db/schema/index.js';
import type { SettingKey, SettingValue } from '#lib/schemas/settings.schema.js';
import type { BatchQuery } from '../common.js';

export async function findSetting(key: SettingKey) {
	const [row] = await db
		.select({ value: appSetting.value, updatedAt: appSetting.updatedAt })
		.from(appSetting)
		.where(eq(appSetting.key, key))
		.limit(1);
	return row;
}

export type SettingRow = NonNullable<Awaited<ReturnType<typeof findSetting>>>;

export function upsertSetting(
	key: SettingKey,
	value: SettingValue,
	updatedBy: string | null
): BatchQuery {
	return db
		.insert(appSetting)
		.values({ key, value, updatedBy })
		.onConflictDoUpdate({
			target: appSetting.key,
			set: { value, updatedBy, updatedAt: new Date() }
		});
}
