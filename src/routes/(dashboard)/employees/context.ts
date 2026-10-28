import { getContext, setContext } from 'svelte';

const KEY = Symbol('personal-patterns');

/** Ids of employees who follow their own cycle, for the badge on every employee row. */
export function setPersonalPatternIds(ids: () => ReadonlySet<string>): void {
	setContext(KEY, ids);
}

export function getPersonalPatternIds(): () => ReadonlySet<string> {
	return getContext<(() => ReadonlySet<string>) | undefined>(KEY) ?? (() => new Set<string>());
}
