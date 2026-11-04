import { getRequestEvent, query } from '$app/server';
import { z } from 'zod';
import { MAX_PERSON_SEARCH } from '#lib/attendance/person-search.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import { searchPeople } from '#lib/server/services/daily/daily.bl.js';

// Remote queries about people (PR45). Each one checks the permission on the server, like a load.

/** The person combobox's suggestions: employee number or name contains the text. */
export const findPeople = query(z.string().max(MAX_PERSON_SEARCH), async (q) => {
	const { locals } = getRequestEvent();
	const user = requirePermission(locals, 'staff.write');
	return searchPeople({ user, permissions: locals.permissions }, q);
});
