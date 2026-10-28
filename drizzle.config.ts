import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL must be set');

export default defineConfig({
	schema: './src/lib/server/db/schema',
	dialect: 'postgresql',
	dbCredentials: { url },
	verbose: true,
	strict: true
});
