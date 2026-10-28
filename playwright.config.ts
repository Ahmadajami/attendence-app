import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the SYNTHETIC test database only, with made-up people seeded by
// `tests/e2e/seed.ts`. The app is a production build (`node build`), which reads its env from
// this process only: a dev server can fall back to `.env` (the real-data DB) when it reloads.
const databaseUrl = process.env.E2E_DATABASE_URL ?? '';
if (!/\/attendance_app_test(\?|$)/.test(databaseUrl))
	throw new Error(
		'Set E2E_DATABASE_URL to the attendance_app_test database (never the real-data one).'
	);

const PORT = 4173;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
	testDir: 'tests/e2e',
	globalSetup: './tests/e2e/seed.ts',
	fullyParallel: false,
	workers: 1,
	use: { baseURL, trace: 'retain-on-failure' },
	projects: [
		// The installed Google Chrome: no browser download needed.
		{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }
	],
	webServer: {
		command: 'pnpm build && node build',
		url: baseURL,
		reuseExistingServer: false,
		timeout: 180_000,
		env: {
			DATABASE_URL: databaseUrl,
			AUTH_MODE: 'local_single_user',
			// Test-only key for a throwaway server; real keys live in ~/secure/syravia/.
			AUTH_JWT_SECRET: 'e2e-only-not-a-secret-e2e-only-not-a-secret-0000',
			HOST: '127.0.0.1',
			PORT: String(PORT),
			ORIGIN: baseURL
		}
	}
});
