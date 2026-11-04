import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// Remote functions (`*.remote.ts`, PR45): the person combobox's server search.
			experimental: { remoteFunctions: true },
			// Root-relative URLs from resolve(), so localizeHref() can prefix them on the server too.
			paths: { relative: false }
		}),

		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true,
			// Locale lives in the URL (`/ar/...`); cookie remembers the last choice.
			strategy: ['url', 'cookie', 'baseLocale']
		})
	],
	// No sign-in in local mode (plan D17): the dev and preview servers answer this machine only.
	server: { host: '127.0.0.1', port: 5173, strictPort: true },
	preview: { host: '127.0.0.1', port: 4173, strictPort: true },
	// Unit tests for pure logic only (CLAUDE.md §2): Node, no database, beside the file they test.
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
		expect: { requireAssertions: true }
	}
});
