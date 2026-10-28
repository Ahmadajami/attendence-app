import { defineEnvVars } from '@sveltejs/kit/env';
import { building } from '$app/env';
import { z } from 'zod';
import { AUTH_MODES } from './lib/server/auth/local-mode.js';

// Optional while building, required when the app starts.
const required = <T extends z.ZodType>(schema: T) => (building ? schema.optional() : schema);

const pgUrl = z.string().regex(/^postgres(ql)?:\/\//, 'expected a postgres:// connection string');

export const variables = defineEnvVars({
	DATABASE_URL: {
		description:
			'Local PostgreSQL connection string (postgres.js), e.g. postgres://attendance_app:…@127.0.0.1:5433/attendance_app. Used by the app and by drizzle-kit.',
		schema: required(pgUrl)
	},

	AUTH_MODE: {
		description:
			'`login` (default): the code sign-in. `local_single_user`: no sign-in; every request acts as the oldest active admin and only loopback clients are served (plan D17). The server refuses to start in that mode unless HOST=127.0.0.1.',
		schema: z.enum(AUTH_MODES).default('login')
	},

	AUTH_JWT_SECRET: {
		description:
			'HS256 key for API access tokens (JWT), at least 32 characters. Generate with `openssl rand -base64 48`. Rotating it signs out every API client.',
		schema: required(z.string().min(32, 'AUTH_JWT_SECRET must be at least 32 characters'))
	}
});
