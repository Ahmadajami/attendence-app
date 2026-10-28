import { defineConfig } from 'drizzle-kit';

// Migrations use the direct (non-pgbouncer) connection when available.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL must be set');

export default defineConfig({
	schema: './src/lib/server/db/schema',
	dialect: 'postgresql',
	dbCredentials: { url },
	verbose: true,
	strict: true
});
