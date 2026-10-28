// Department tree helpers. Pure: no DB, no SvelteKit, so they are unit-tested in Node.

export type DepartmentNode = { id: string; parentId: string | null };

/**
 * Depth-first order (parents before children, siblings by `compare`), with each row's depth.
 * Rows whose parent is missing are treated as roots, so nothing is ever dropped.
 */
export function flattenTree<T extends DepartmentNode>(
	rows: readonly T[],
	compare: (a: T, b: T) => number
): (T & { depth: number })[] {
	const ids = new Set(rows.map((row) => row.id));
	const children = new Map<string | null, T[]>();
	for (const row of rows) {
		const key = row.parentId && ids.has(row.parentId) ? row.parentId : null;
		const list = children.get(key) ?? [];
		list.push(row);
		children.set(key, list);
	}

	const out: (T & { depth: number })[] = [];
	const seen = new Set<string>();
	const visit = (parentId: string | null, depth: number) => {
		for (const row of [...(children.get(parentId) ?? [])].sort(compare)) {
			if (seen.has(row.id)) continue; // defensive: a cycle in bad data must not loop
			seen.add(row.id);
			out.push({ ...row, depth });
			visit(row.id, depth + 1);
		}
	};
	visit(null, 0);
	return out;
}

/** Every department below `id` (children, grandchildren…), not `id` itself. */
export function descendantIds(rows: readonly DepartmentNode[], id: string): Set<string> {
	const byParent = new Map<string, string[]>();
	for (const row of rows) {
		if (!row.parentId) continue;
		byParent.set(row.parentId, [...(byParent.get(row.parentId) ?? []), row.id]);
	}
	const found = new Set<string>();
	const stack = [...(byParent.get(id) ?? [])];
	while (stack.length > 0) {
		const next = stack.pop() as string;
		if (found.has(next)) continue;
		found.add(next);
		stack.push(...(byParent.get(next) ?? []));
	}
	return found;
}

/** True when moving `id` under `parentId` would make it its own ancestor. */
export function wouldCreateCycle(
	rows: readonly DepartmentNode[],
	id: string,
	parentId: string | null
): boolean {
	if (parentId === null) return false;
	return parentId === id || descendantIds(rows, id).has(parentId);
}
