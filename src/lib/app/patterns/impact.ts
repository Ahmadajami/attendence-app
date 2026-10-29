import { localizedHref } from '#lib/i18n.js';
import type { ImpactRequest } from '#lib/schemas/pattern.schema.js';
import type { TargetImpact } from '#lib/server/services/assignments/assignments.bl.js';

/**
 * Ask the server what an assignment would do (builder step 3, assign sheet). Throws an `Error` with
 * the server's message when it refuses.
 */
export async function fetchImpact(request: ImpactRequest): Promise<TargetImpact[]> {
	const response = await fetch(localizedHref('/patterns/impact'), {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(request)
	});
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as { message?: string } | null;
		throw new Error(body?.message ?? response.statusText);
	}
	return (await response.json()) as TargetImpact[];
}
