/**
 * Finds e2e files that take `test` or `expect` from `@playwright/test`
 * instead of `./fixtures`. `site/e2e/fixtures.ts` extends Playwright's
 * `test` so that a console error, a page error or a Content Security Policy
 * violation fails the test. A spec that imports Playwright's own `test`
 * skips those checks. `tests/scripts/e2e-imports.test.ts` runs this over
 * every file in `site/e2e/` except `fixtures.ts`.
 *
 * A type-only import (`import type { Page }`, or `type Page` inside a mixed
 * import) brings no value in, so it passes.
 */
import ts from 'typescript';

export const PLAYWRIGHT = '@playwright/test';

/** The value names a spec must take from `./fixtures`. */
export const FIXTURE_VALUES = new Set(['test', 'expect']);

/**
 * @typedef {{ line: number, what: string }} Violation
 */

/**
 * Lists every import or re-export in `source` that brings a value `test` or
 * `expect` (or the whole module, through a default, namespace or `export *`
 * form) from `@playwright/test`.
 *
 * @param {string} source TypeScript source text.
 * @param {string} [fileName] Used only for the parser's diagnostics.
 * @returns {Violation[]}
 */
export function playwrightValueImports(source, fileName = 'spec.ts') {
	const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	/** @type {Violation[]} */
	const found = [];
	const lineOf = (/** @type {ts.Node} */ node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
	const fromPlaywright = (/** @type {ts.Expression | undefined} */ spec) =>
		spec !== undefined && ts.isStringLiteral(spec) && spec.text === PLAYWRIGHT;

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
