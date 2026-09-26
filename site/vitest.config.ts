/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// `getViteConfig` gives the tests the same aliases (`@lib/*`, `@scripts/*`)
// and virtual modules (`astro:content`) the site builds with, so a lib module
// needs no test-only shim. Two things it does not give:
//
// - `import.meta.env.BASE_URL`: Vitest builds `import.meta.env` from
//   `test.env`, so the site's base is repeated here for `lib/url.ts`. It must
//   match `base` in astro.config.mjs (that file cannot be imported here: it
//   pulls in a TypeScript-only integration Node refuses to load from
//   node_modules).
// - Content collections: `getViteConfig` skips the content sync, so
//   `getCollection()` returns nothing. Tests that need a lesson list mock
//   `astro:content` (see tests/lib/content.ts) with a small fixture set.
export default getViteConfig({
	test: {
		env: { BASE_URL: '/ai-training/' },
		include: ['tests/**/*.test.ts'],
		// Pure modules run under Node. A test that needs a DOM says so at its
		// top with `// @vitest-environment happy-dom`.
		environment: 'node',
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			reportsDirectory: 'coverage',
			// The floor covers the plain TypeScript modules and the shared part
			// of the repo scripts. `.astro` components are not instrumented:
			// their template half is exercised by the e2e suite, and the
			// Container API tests only render a few of them. Widen this once
			// component tests cover the rest.
			// `plugins/` holds the remark plugins astro.config.mjs wires in;
			// tests/plugins runs them through unified on small MDX inputs.
			include: ['src/lib/**/*.ts', 'src/scripts/**/*.ts', 'scripts/lib/**/*.mjs', 'plugins/**/*.mjs'],
			// `lesson-context.ts` reads Starlight's route locals and has no
			// logic of its own; it is exercised by the component tests and
			// the build. The entry scripts directly under scripts/ are outside
			// the include. The check scripts and lesson-plan.mjs only read argv
			// and call scripts/lib, where the floor measures their logic, so
			// put new logic there too. gen-favicon.mjs, screenshot.mjs and
			// serve-dist.mjs are dev tools with their code in the file and no
			// tests.
			exclude: ['src/lib/lesson-context.ts'],
			thresholds: {
				lines: 80,
				functions: 80,
				branches: 80,
				statements: 80,
			},
		},
	},
});
