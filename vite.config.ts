import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-vercel';
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
	// Unit tests for pure logic only (CLAUDE.md §2): Node, no database, beside the file they test.
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
		expect: { requireAssertions: true }
	}
});
