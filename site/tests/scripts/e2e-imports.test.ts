import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { describeViolations, playwrightValueImports, scriptKind } from '../../scripts/lib/e2e-imports.mjs';

const E2E = fileURLToPath(new URL('../../e2e', import.meta.url));

/** The `what` of each violation in `source`. */
const found = (source: string) => playwrightValueImports(source).map((v) => v.what);

describe('playwrightValueImports', () => {
	it('flags a named import of test or expect', () => {
		expect(found("import { test } from '@playwright/test';\n")).toEqual(['`test`']);
		expect(found("import { expect, test } from '@playwright/test';\n")).toEqual(['`expect`', '`test`']);
	});

	it('flags a renamed import, which still binds the value', () => {
		expect(found("import { test as base } from '@playwright/test';\n")).toEqual(['`test`']);
	});

	it('flags the value in a mixed import and lets its types through', () => {
		expect(found("import { type Page, test } from '@playwright/test';\n")).toEqual(['`test`']);
	});

	it('flags a default or a namespace import', () => {
		expect(found("import pw from '@playwright/test';\n")).toEqual(['the default import `pw`']);
		expect(found("import * as pw from '@playwright/test';\n")).toEqual(['the namespace import `* as pw`']);
	});

	it('flags the default export by name, which is test', () => {
		expect(found("import { default as test } from '@playwright/test';\n")).toEqual(['`default`']);
		expect(found("export { default } from '@playwright/test';\n")).toEqual(['the re-export of `default`']);
		expect(found("export { default as test } from '@playwright/test';\n")).toEqual(['the re-export of `default`']);
	});

	it('treats playwright/test as the same module', () => {
		expect(found("import { test } from 'playwright/test';\n")).toEqual(['`test`']);
		expect(found("export { expect } from 'playwright/test';\n")).toEqual(['the re-export of `expect`']);
		expect(found("import type { Page } from 'playwright/test';\n")).toEqual([]);
	});

	it('parses JavaScript and JSX files by their extension', () => {
		const js = "import { test } from '@playwright/test';\n";
		expect(playwrightValueImports(js, 'a.spec.js')).toEqual([{ line: 1, what: '`test`' }]);
		expect(playwrightValueImports(js, 'a.spec.mjs')).toEqual([{ line: 1, what: '`test`' }]);
		// A .tsx file with an element in it. The scriptKind cases below pin which kind each extension gets.
		const tsx = "import { test } from '@playwright/test';\nconst el = <div>{test.name}</div>;\n";
		expect(playwrightValueImports(tsx, 'a.spec.tsx')).toEqual([{ line: 1, what: '`test`' }]);
	});

	it('flags a re-export of test or expect, and an export star', () => {
		expect(found("export { test } from '@playwright/test';\n")).toEqual(['the re-export of `test`']);
		expect(found("export { expect as check } from '@playwright/test';\n")).toEqual(['the re-export of `expect`']);
		expect(found("export * from '@playwright/test';\n")).toEqual(['`export *`']);
		expect(found("export * as pw from '@playwright/test';\n")).toEqual(['`export * as pw`']);
	});

	it('lets type-only imports and exports through', () => {
		expect(found("import type { Page } from '@playwright/test';\n")).toEqual([]);
		expect(found("import type { test } from '@playwright/test';\n")).toEqual([]);
		expect(found("import { type test, type Page } from '@playwright/test';\n")).toEqual([]);
		expect(found("import type * as pw from '@playwright/test';\n")).toEqual([]);
		expect(found("export type { Page } from '@playwright/test';\n")).toEqual([]);
		expect(found("export { type test } from '@playwright/test';\n")).toEqual([]);
	});

	it('lets other values and other modules through', () => {
		expect(found("import { devices } from '@playwright/test';\n")).toEqual([]);
		expect(found("import '@playwright/test';\n")).toEqual([]);
		expect(found("import { expect, test } from './fixtures';\n")).toEqual([]);
		expect(found("export { test } from './fixtures';\n")).toEqual([]);
	});

	it('gives the line of each offending name', () => {
		const source =
			"import type { Page } from '@playwright/test';\nimport {\n\ttype Locator,\n\ttest,\n} from '@playwright/test';\n";
		expect(playwrightValueImports(source)).toEqual([{ line: 4, what: '`test`' }]);
	});
});

describe('scriptKind', () => {
	it('picks the kind from the extension', () => {
		expect(scriptKind('a.tsx')).toBe(ts.ScriptKind.TSX);
		expect(scriptKind('a.jsx')).toBe(ts.ScriptKind.JSX);
		expect(scriptKind('a.js')).toBe(ts.ScriptKind.JS);
		expect(scriptKind('a.mjs')).toBe(ts.ScriptKind.JS);
		expect(scriptKind('a.cjs')).toBe(ts.ScriptKind.JS);
		expect(scriptKind('a.ts')).toBe(ts.ScriptKind.TS);
		expect(scriptKind('a.mts')).toBe(ts.ScriptKind.TS);
	});
});

describe('describeViolations', () => {
	it('names ./fixtures in each line', () => {
		const lines = describeViolations(
			'e2e/new.spec.ts',
			playwrightValueImports("import { test } from '@playwright/test';\n"),
		);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatch(
			/^e2e\/new\.spec\.ts:1: takes `test` from @playwright\/test\. Import test and expect from \.\/fixtures/,
		);
	});
});

describe('site/e2e', () => {
	// Recursive, so a spec in a subdirectory is checked too. The pattern is every
	// script extension Playwright's default testMatch can pick up.
	const files = readdirSync(E2E, { recursive: true, encoding: 'utf8' }).filter((name) => /\.[cm]?[jt]sx?$/.test(name));

	it('has specs to check', () => {
		expect(files.filter((name) => name.endsWith('.spec.ts')).length).toBeGreaterThan(0);
	});

	it('sees the import in fixtures.ts, the one file allowed to make it', () => {
		// If this fails, the parser no longer sees the import the specs must avoid.
		expect(found(readFileSync(join(E2E, 'fixtures.ts'), 'utf8'))).toContain('`test`');
	});

	// Only the top-level fixtures.ts is exempt: `sub/fixtures.ts` is checked like a spec.
	it('takes test and expect from ./fixtures in every other file', () => {
		const problems = files
			.filter((name) => name !== 'fixtures.ts')
			.flatMap((name) =>
				describeViolations(`site/e2e/${name}`, playwrightValueImports(readFileSync(join(E2E, name), 'utf8'), name)),
			);
		expect(problems, problems.join('\n')).toEqual([]);
	});
});
