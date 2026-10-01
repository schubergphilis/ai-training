/**
 * Finds e2e files that take `test` or `expect` from `@playwright/test`
 * (or `playwright/test`)
 * instead of `./fixtures`. `site/e2e/fixtures.ts` extends Playwright's
 * `test` so that a console error, a page error or a Content Security Policy
 * violation fails the test. A spec that imports Playwright's own `test`
 * skips those checks. `tests/scripts/e2e-imports.test.ts` runs this over
 * every script file in `site/e2e/` except the top-level `fixtures.ts`.
 *
 * A type-only import (`import type { Page }`, or `type Page` inside a mixed
 * import) brings no value in, so it passes.
 */
import ts from 'typescript';

export const PLAYWRIGHT = '@playwright/test';

/**
 * The module names that resolve to Playwright's test runner. `playwright/test`
 * is the same module as `@playwright/test`.
 */
export const PLAYWRIGHT_MODULES = new Set([PLAYWRIGHT, 'playwright/test']);

/**
 * The value names a spec must take from `./fixtures`. `default` is in the
 * list because the module's default export is `test`, so
 * `import { default as test }` binds it too.
 */
export const FIXTURE_VALUES = new Set(['test', 'expect', 'default']);

/**
 * @typedef {{ line: number, what: string }} Violation
 */

/**
 * The script kind for a file name: TSX for `.tsx`, JSX for `.jsx`, JS for
 * `.js`, `.mjs` and `.cjs`, and TS for anything else.
 *
 * @param {string} fileName
 * @returns {ts.ScriptKind}
 */
export function scriptKind(fileName) {
	if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX;
	if (fileName.endsWith('.jsx')) return ts.ScriptKind.JSX;
	if (/\.[cm]?js$/.test(fileName)) return ts.ScriptKind.JS;
	return ts.ScriptKind.TS;
}

/**
 * Lists every import or re-export in `source` that brings a value `test` or
 * `expect` (or the whole module, through a default, namespace or `export *`
 * form) from `@playwright/test` or `playwright/test`.
 *
 * @param {string} source TypeScript source text.
 * @param {string} [fileName] Its extension picks the parser's script kind (see `scriptKind`).
 * @returns {Violation[]}
 */
export function playwrightValueImports(source, fileName = 'spec.ts') {
	const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind(fileName));
	/** @type {Violation[]} */
	const found = [];
	const lineOf = (/** @type {ts.Node} */ node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
	const fromPlaywright = (/** @type {ts.Expression | undefined} */ spec) =>
		spec !== undefined && ts.isStringLiteral(spec) && PLAYWRIGHT_MODULES.has(spec.text);

	for (const statement of file.statements) {
		if (ts.isImportDeclaration(statement) && fromPlaywright(statement.moduleSpecifier)) {
			const clause = statement.importClause;
			// `import '@playwright/test'` binds nothing, and `import type` binds only types.
			if (clause === undefined || clause.isTypeOnly) continue;
			if (clause.name !== undefined) {
				found.push({ line: lineOf(statement), what: `the default import \`${clause.name.text}\`` });
			}
			const bindings = clause.namedBindings;
			if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
				found.push({ line: lineOf(statement), what: `the namespace import \`* as ${bindings.name.text}\`` });
			}
			if (bindings !== undefined && ts.isNamedImports(bindings)) {
				for (const element of bindings.elements) {
					const imported = (element.propertyName ?? element.name).text;
					if (!element.isTypeOnly && FIXTURE_VALUES.has(imported)) {
						found.push({ line: lineOf(element), what: `\`${imported}\`` });
					}
				}
			}
		}
		if (ts.isExportDeclaration(statement) && fromPlaywright(statement.moduleSpecifier)) {
			if (statement.isTypeOnly) continue;
			const clause = statement.exportClause;
			if (clause === undefined) {
				found.push({ line: lineOf(statement), what: '`export *`' });
			} else if (ts.isNamespaceExport(clause)) {
				found.push({ line: lineOf(statement), what: `\`export * as ${clause.name.text}\`` });
			} else {
				for (const element of clause.elements) {
					const exported = (element.propertyName ?? element.name).text;
					if (!element.isTypeOnly && FIXTURE_VALUES.has(exported)) {
						found.push({ line: lineOf(element), what: `the re-export of \`${exported}\`` });
					}
				}
			}
		}
	}
	return found;
}

/**
 * One line per violation, each naming `./fixtures`.
 *
 * @param {string} path The file's path, as the message shows it.
 * @param {Violation[]} violations
 * @returns {string[]}
 */
export function describeViolations(path, violations) {
	return violations.map(
		(v) =>
			`${path}:${v.line}: takes ${v.what} from ${PLAYWRIGHT}. Import test and expect from ./fixtures instead, so the test fails on a console error or a Content Security Policy violation.`,
	);
}
