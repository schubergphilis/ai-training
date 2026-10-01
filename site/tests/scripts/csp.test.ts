import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CSP, checkCsp, DIRECTIVES, pageProblems, parsePolicy, sha256 } from '../../scripts/lib/csp.mjs';

const roots: string[] = [];
afterAll(() => {
	for (const r of roots) rmSync(r, { recursive: true, force: true });
});

const SCRIPT = 'console.log(1);';
const STYLE = 'p{color:red}';

/** The policy Astro writes, with the given script-src and style-src sources, HTML-escaped as in a built page. */
function policy(scriptSrc: string[], styleSrc: string[], directives = DIRECTIVES) {
	return [...directives, `script-src ${scriptSrc.join(' ')}`, `style-src ${styleSrc.join(' ')}`]
		.join('; ')
		.replaceAll("'", '&#39;');
}

const meta = (content: string) => `<meta http-equiv="content-security-policy" content="${content}">`;

/** A page with the meta in its head, the given head and body markup. */
function page({
	content = policy(["'self'", `'${sha256(SCRIPT)}'`], ["'self'", `'${sha256(STYLE)}'`]),
	head = '',
	body = '',
} = {}) {
	return `<!doctype html><html><head>${meta(content)}${head}</head><body>${body}</body></html>`;
}

/** A temp dist tree with the given files, path to content. */
function dist(files: Record<string, string>) {
	const root = mkdtempSync(join(tmpdir(), 'csp-'));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return root;
}

describe('the policy for astro.config.mjs', () => {
	it('gives scripts no unsafe source and allows only style attributes inline', () => {
		expect(CSP.scriptDirective?.resources).toEqual(["'self'"]);
		expect(CSP.styleDirective?.resources).toEqual(["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }]);
		expect(CSP.directives).toContain("default-src 'self'");
	});
});

describe('sha256', () => {
	it('is the base64 SHA-256 of the text, as CSP names it', () => {
		// The hash of the empty string, which every CSP reference lists.
		expect(sha256('')).toBe('sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=');
	});
});

describe('parsePolicy', () => {
	it('splits directives and sources', () => {
		const p = parsePolicy("default-src 'self';img-src 'self' data:; script-src 'self' ");
		expect(p.get('default-src')).toEqual(["'self'"]);
		expect(p.get('img-src')).toEqual(["'self'", 'data:']);
		expect(p.get('script-src')).toEqual(["'self'"]);
	});
});

describe('pageProblems', () => {
	it('passes a page whose inline script and style are hashed, with an external script and a JSON block', () => {
		expect(
			pageProblems(
				page({
					head: `<script>${SCRIPT}</script><style>${STYLE}</style><script type="module" src="/a.js"></script>`,
					body: '<script type="application/json">{"a":1}</script><code>&lt;a onclick=x&gt;</code>',
				}),
			),
		).toEqual([]);
	});

	it('rejects a page without the meta, with two, or with it outside head', () => {
		expect(pageProblems('<html><head></head><body></body></html>')).toEqual(['no Content Security Policy <meta>']);
		const content = policy(["'self'"], ["'self'"]);
		expect(pageProblems(page({ head: meta(content) }))).toContain(
			'2 Content Security Policy <meta> tags, expected one',
		);
		expect(pageProblems(`<html><head></head><body>${meta(content)}</body></html>`)).toContain(
			'the Content Security Policy <meta> is not in <head>',
		);
	});

	it('rejects a policy that lacks a directive of the list', () => {
		const content = policy(["'self'"], ["'self'"], ["default-src 'self'", "img-src 'self'"]);
		expect(pageProblems(page({ content }))).toEqual([
			`policy lacks "connect-src 'self'"`,
			`policy lacks "img-src 'self' data:"`,
			`policy lacks "base-uri 'self'"`,
			`policy lacks "form-action 'self'"`,
		]);
	});

	it("rejects 'unsafe-inline' or 'unsafe-eval' for scripts and 'unsafe-inline' for style elements", () => {
		const content = policy(["'self'", "'unsafe-inline'", "'unsafe-eval'"], ["'self'", "'unsafe-inline'"]);
		expect(pageProblems(page({ content }))).toEqual([
			"script-src allows 'unsafe-inline'",
			"script-src allows 'unsafe-eval'",
			"style-src allows 'unsafe-inline'",
		]);
	});

	it('rejects an inline script or style whose hash is not in the policy, and names the hash', () => {
		const problems = pageProblems(page({ body: '<script>alert(1)</script><style>b{}</style>' }));
		expect(problems).toEqual([
			`inline <script> not in script-src: '${sha256('alert(1)')}' "alert(1)"`,
			`inline <style> not in style-src: '${sha256('b{}')}' "b{}"`,
		]);
	});

	it('does not take a script hash for a style or a style hash for a script', () => {
		const content = policy(["'self'", `'${sha256(STYLE)}'`], ["'self'", `'${sha256(SCRIPT)}'`]);
		expect(pageProblems(page({ content, head: `<script>${SCRIPT}</script><style>${STYLE}</style>` }))).toHaveLength(2);
	});

	it('rejects an inline event handler attribute, and not markup in a script string', () => {
		expect(pageProblems(page({ body: '<button onclick="go()">Go</button>' }))).toEqual([
			'inline event handler attribute onclick= on <button>',
		]);
		const content = policy(["'self'", `'${sha256("x='<a onclick=y>'")}'`], ["'self'"]);
		expect(pageProblems(page({ content, body: "<script>x='<a onclick=y>'</script>" }))).toEqual([]);
	});

	it('finds a handler after a quoted attribute value that holds a >', () => {
		expect(pageProblems(page({ body: `<a title="a>b" onclick="x">x</a><b data-x='>' onmouseover=y>` }))).toEqual([
			'inline event handler attribute onclick= on <a>',
			'inline event handler attribute onmouseover= on <b>',
		]);
	});

	it('checks an inline script that comes before the meta, which the policy does not cover in the browser', () => {
		const content = policy(["'self'"], ["'self'"]);
		const html = `<html><head><script>${SCRIPT}</script>${meta(content)}</head><body></body></html>`;
		expect(pageProblems(html)).toEqual([`inline <script> not in script-src: '${sha256(SCRIPT)}' "${SCRIPT}"`]);
	});

	it('rejects an off-site script or stylesheet anywhere in the page, before the meta too', () => {
		const content = policy(["'self'"], ["'self'"]);
		const before =
			'<script src="https://cdn.example.com/a.js"></script><link rel="stylesheet" href="//cdn.example.com/a.css">';
		const after = '<script type="module" src="data:text/javascript,alert(1)"></script>';
		const html = `<html><head>${before}${meta(content)}</head><body>${after}</body></html>`;
		expect(pageProblems(html)).toEqual([
			'<script> loads an off-site file: https://cdn.example.com/a.js',
			'<link rel="stylesheet"> loads an off-site file: //cdn.example.com/a.css',
			'<script> loads an off-site file: data:text/javascript,alert(1)',
		]);
	});

	it('passes a site script, a site stylesheet and an off-site link that is no stylesheet', () => {
		const html = page({
			head: '<script src="/ai-training/_astro/a.js"></script><link rel="stylesheet" href="/ai-training/_astro/a.css"><link rel="canonical" href="https://schubergphilis.github.io/ai-training/">',
		});
		expect(pageProblems(html)).toEqual([]);
	});

	it('checks an import map, speculation rules and a data-type attribute, and skips only JSON data blocks', () => {
		const html = page({
			body: [
				'<script type="importmap">{"imports":{}}</script>',
				'<script type="speculationrules">{"prerender":[]}</script>',
				'<script data-type="application/json">alert(1)</script>',
				'<script type="application/json">{"a":1}</script>',
				'<script type=\'application/ld+json\'>{"@context":"x"}</script>',
			].join(''),
		});
		expect(pageProblems(html)).toEqual([
			`inline <script> not in script-src: '${sha256('{"imports":{}}')}' "{"imports":{}}"`,
			`inline <script> not in script-src: '${sha256('{"prerender":[]}')}' "{"prerender":[]}"`,
			`inline <script> not in script-src: '${sha256('alert(1)')}' "alert(1)"`,
		]);
	});
});

describe('checkCsp', () => {
	it('reads every HTML page under dist and skips other files', () => {
		const root = dist({
			'index.html': page(),
			'a/index.html': '<html><head></head></html>',
			'a/index.md': '# no policy here',
			'data/index.json': '{}',
		});
		expect(checkCsp(root)).toEqual({ errors: ['a/index.html: no Content Security Policy <meta>'], pages: 2 });
	});
});
