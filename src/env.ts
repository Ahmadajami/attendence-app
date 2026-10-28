import { defineEnvVars } from '@sveltejs/kit/env';
import { building } from '$app/env';
import { z } from 'zod';

// Optional while building, required when the app starts.
const required = <T extends z.ZodType>(schema: T) => (building ? schema.optional() : schema);

const pgUrl = z.string().regex(/^postgres(ql)?:\/\//, 'expected a postgres:// connection string');
const nonEmpty = z.string().min(1);

const INTEGRATION = 'Neon/Vercel integration parameter (not used by app code).';

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Pooled Neon connection string, used by the app runtime (neon-http).',
		schema: required(pgUrl)
	},
	DATABASE_URL_UNPOOLED: {
		description: 'Direct Neon connection string (no pgbouncer), used by drizzle-kit migrations.',
		schema: required(pgUrl)
	},

	AUTH_JWT_SECRET: {
		description:
			'HS256 key for API access tokens (JWT), at least 32 characters. Generate with `openssl rand -base64 48`. Rotating it signs out every API client.',
		schema: required(z.string().min(32, 'AUTH_JWT_SECRET must be at least 32 characters'))
	},

	PGHOST: { description: `Pooled host. ${INTEGRATION}`, schema: nonEmpty.optional() },
	PGHOST_UNPOOLED: { description: `Direct host. ${INTEGRATION}`, schema: nonEmpty.optional() },
	PGUSER: { description: `Database user. ${INTEGRATION}`, schema: nonEmpty.optional() },
	PGDATABASE: { description: `Database name. ${INTEGRATION}`, schema: nonEmpty.optional() },
	PGPASSWORD: { description: `Database password. ${INTEGRATION}`, schema: nonEmpty.optional() },

	POSTGRES_URL: { description: `Pooled URL. ${INTEGRATION}`, schema: pgUrl.optional() },
	POSTGRES_URL_NON_POOLING: { description: `Direct URL. ${INTEGRATION}`, schema: pgUrl.optional() },
	POSTGRES_USER: { description: `Database user. ${INTEGRATION}`, schema: nonEmpty.optional() },
	POSTGRES_HOST: { description: `Pooled host. ${INTEGRATION}`, schema: nonEmpty.optional() },
	POSTGRES_PASSWORD: {
		description: `Database password. ${INTEGRATION}`,
		schema: nonEmpty.optional()
	},
	POSTGRES_DATABASE: { description: `Database name. ${INTEGRATION}`, schema: nonEmpty.optional() },
	POSTGRES_URL_NO_SSL: {
		description: `Pooled URL without SSL. ${INTEGRATION}`,
		schema: pgUrl.optional()
	},
	POSTGRES_PRISMA_URL: {
		description: `Pooled URL for Prisma. ${INTEGRATION}`,
		schema: pgUrl.optional()
	}
});
