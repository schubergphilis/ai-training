import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
	CSP,
	checkCsp,
	commentEnd,
	DIRECTIVES,
	FETCHING_RELS,
	offSite,
	pageProblems,
	parsePolicy,
	readTag,
	sha256,
	srcsetUrls,
	tags,
} from '../../scripts/lib/csp.mjs';

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
			'<link rel="stylesheet"> loads an off-site file: //cdn.example.com/a.css (resolves to https://cdn.example.com/a.css)',
			'<script> loads an off-site file: data:text/javascript,alert(1)',
		]);
	});

	it('passes a site script, a site stylesheet and an off-site link that is no stylesheet', () => {
		const html = page({
			head: '<script src="/ai-training/_astro/a.js"></script><link rel="stylesheet" href="/ai-training/_astro/a.css"><link rel="canonical" href="https://schubergphilis.github.io/ai-training/">',
		});
		expect(pageProblems(html)).toEqual([]);
	});

	it('resolves a script URL as the browser does before it compares the origin', () => {
		const srcs = [
			'/\\evil.example/a.js',
			'\\/evil.example/a.js',
			'https&#58;//evil.example/a.js',
			'https&colon;//evil.example/a.js',
			'https&#x3A//evil.example/a.js',
			'ht\ttps://evil.example/a.js',
			'https:/\n/evil.example/a.js',
			' \u0001https://evil.example/a.js',
			'&#47;&#47;evil.example/a.js',
			'HTTPS://EVIL.EXAMPLE/a.js',
		];
		const body = srcs.map((src) => `<script src="${src}"></script>`).join('');
		const problems = pageProblems(page({ body }));
		expect(problems).toHaveLength(srcs.length);
		for (const [i, src] of srcs.entries())
			expect(problems[i]).toBe(`<script> loads an off-site file: ${src} (resolves to https://evil.example/a.js)`);
	});

	it('rejects an off-site link of every fetching rel, in any case and among other tokens', () => {
		const links = [
			['icon', '<link rel="icon" href="https://evil.example/i.png">'],
			['icon', '<link rel="shortcut icon" href="https://evil.example/i.png">'],
			['icon', '<link rel="ICON" href="https://evil.example/i.png">'],
			['icon', '<link rel=" Icon\t" href="https://evil.example/i.png">'],
			['icon', '<link rel="ic&#111;n" href="https://evil.example/i.png">'],
			['preload stylesheet', '<link rel="preload stylesheet" href="https://evil.example/i.png">'],
			...FETCHING_RELS.map((rel) => [rel, `<link rel="${rel}" href="https://evil.example/i.png">`]),
		];
		const problems = pageProblems(page({ head: links.map(([, link]) => link).join('') }));
		expect(problems).toEqual(
			links.map(([rel]) => `<link rel="${rel}"> loads an off-site file: https://evil.example/i.png`),
		);
	});

	it('checks every imagesrcset candidate of a fetching link, with or without an href', () => {
		const head = [
			'<link rel="preload" as="image" imagesrcset="/ai-training/a.png 1x, https://evil.example/b.png 2x">',
			'<link rel="preload" as="image" href="/ai-training/a.png" imagesrcset="//evil.example/c.png 100w">',
			'<link rel="alternate" imagesrcset="https://evil.example/d.png">',
		].join('');
		expect(pageProblems(page({ head }))).toEqual([
			'<link rel="preload"> imagesrcset loads an off-site file: https://evil.example/b.png',
			'<link rel="preload"> imagesrcset loads an off-site file: //evil.example/c.png (resolves to https://evil.example/c.png)',
		]);
	});

	it('finds an off-site file in an uppercase or unquoted tag', () => {
		const body = "<SCRIPT SRC=https://evil.example/a.js></SCRIPT><LINK REL=ICON HREF='https://evil.example/i.png'>";
		expect(pageProblems(page({ body }))).toEqual([
			'<script> loads an off-site file: https://evil.example/a.js',
			'<link rel="icon"> loads an off-site file: https://evil.example/i.png',
		]);
	});

	it('rejects an off-site <base>, which would move every relative URL after it', () => {
		const html = `<html><head><base href="https://evil.example/">${meta(policy(["'self'"], ["'self'"]))}</head></html>`;
		expect(pageProblems(html)).toEqual(['<base> points off the site: https://evil.example/']);
		expect(pageProblems(page({ head: '<base href="/ai-training/">' }))).toEqual([]);
	});

	it('passes an off-site link whose rel fetches nothing, and a fetching link from the site', () => {
		const head = [
			'<link rel="alternate" href="https://evil.example/feed.xml">',
			'<link rel="iconic" href="https://evil.example/x">',
			'<link rel="icon" href="/ai-training/favicon.svg">',
			'<link rel="preload" href="https://schubergphilis.github.io/ai-training/a.woff2">',
		].join('');
		expect(pageProblems(page({ head }))).toEqual([]);
	});

	it('rejects a protocol-relative, a data: and a blob: URL, and passes a URL the browser cannot parse', () => {
		const body = [
			'<script src="//evil.example/a.js"></script>',
			'<script src="data:text/javascript,1"></script>',
			'<script src="blob:https://schubergphilis.github.io/0-1"></script>',
			// The browser loads nothing from a URL it cannot parse, so it is no request to another site.
			'<script src="https://[::1/a.js"></script>',
		].join('');
		expect(pageProblems(page({ body }))).toEqual([
			'<script> loads an off-site file: //evil.example/a.js (resolves to https://evil.example/a.js)',
			'<script> loads an off-site file: data:text/javascript,1',
			'<script> loads an off-site file: blob:https://schubergphilis.github.io/0-1',
		]);
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

describe('pageProblems reads tags as the HTML tokenizer does', () => {
	it('ends a tag at the > after an unquoted value with a quote in it, and checks the script after it', () => {
		// The example of issue #651.
		const body = `<script src=x' ></script><script src="https://evil.example/a.js"></script><i title='>`;
		expect(pageProblems(page({ body }))).toEqual(['<script> loads an off-site file: https://evil.example/a.js']);
	});

	it('checks the hash of an inline script after a tag with a quote in an unquoted value', () => {
		const body = `<script src=x' ></script><script>alert(1)</script><i title='></i><script src="/ai-training/a.js"></script>`;
		expect(pageProblems(page({ body }))).toEqual([
			`inline <script> not in script-src: '${sha256('alert(1)')}' "alert(1)"`,
		]);
	});

	it('reads a quote in an attribute name as a letter of the name', () => {
		const body = `<a b'c>a</a><script src=//evil.example/a.js></script><i title='>`;
		expect(pageProblems(page({ body }))).toEqual([
			'<script> loads an off-site file: //evil.example/a.js (resolves to https://evil.example/a.js)',
		]);
	});

	it('ends a script at an end tag with attributes, and checks the markup after it', () => {
		const body = '<script>a</script x><script src=//evil.example/a.js></script>';
		expect(pageProblems(page({ body }))).toEqual([
			`inline <script> not in script-src: '${sha256('a')}' "a"`,
			'<script> loads an off-site file: //evil.example/a.js (resolves to https://evil.example/a.js)',
		]);
	});

	it('finds the meta in any attribute order and case, and not in a script string', () => {
		const content = policy(["'self'"], ["'self'"]);
		const html = `<html><HEAD><META CONTENT="${content}" HTTP-EQUIV=Content-Security-Policy></head><body><script src="/ai-training/a.js">x='${meta(content)}'</script></body></html>`;
		expect(pageProblems(html)).toEqual([]);
	});
});

describe('pageProblems skips comments and the text of text elements as the browser does', () => {
	const ALERT = `inline <script> not in script-src: '${sha256('alert(1)')}' "alert(1)"`;

	it('checks an inline script after a comment that holds a quote', () => {
		const body = `<!-- <i title=' --><script>alert(1)</script><p>it's</p>`;
		expect(pageProblems(page({ body }))).toEqual([ALERT]);
	});

	it('checks an inline script after a bogus comment that holds a quote', () => {
		const body = `</ <i title='><script>alert(1)</script><p>it's</p>`;
		expect(pageProblems(page({ body }))).toEqual([ALERT]);
	});

	it('checks an inline script after a title or noscript that holds a quote', () => {
		for (const name of ['title', 'noscript']) {
			const body = `<${name}><i title='</${name}><script>alert(1)</script><p>it's</p>`;
			expect(pageProblems(page({ body }))).toEqual([ALERT]);
		}
	});

	it('reads the content of a title inside svg as markup, where a script runs', () => {
		expect(pageProblems(page({ body: '<svg><title><script>alert(1)</script></title></svg>' }))).toEqual([ALERT]);
		// A self-closing <svg/> starts no foreign content, so the title after it is text again.
		const body = `<svg/><title><i title='</title><script>alert(1)</script><p>it's</p>`;
		expect(pageProblems(page({ body }))).toEqual([ALERT]);
	});

	it('hashes a script inside svg and reads the markup in it', () => {
		expect(pageProblems(page({ body: '<svg><script><a onclick=x></a></script></svg>' }))).toEqual([
			`inline <script> not in script-src: '${sha256('<a onclick=x></a>')}' "<a onclick=x></a>"`,
			'inline event handler attribute onclick= on <a>',
		]);
	});

	it('hashes a script with CRLF and CR line ends as the browser does, with LF', () => {
		const content = policy(["'self'", `'${sha256('a\nb\nc')}'`], ["'self'"]);
		expect(pageProblems(page({ content, body: '<script>a\r\nb\rc</script>' }))).toEqual([]);
	});
});

describe('commentEnd', () => {
	it('ends a comment at -->, --!> or right away, and a bogus comment at the next >', () => {
		expect(commentEnd('<!-- a -->b', 0, false)).toBe(10);
		expect(commentEnd('<!-- a --!>b', 0, false)).toBe(11);
		expect(commentEnd('<!-->b', 0, false)).toBe(5);
		expect(commentEnd('<!--->b', 0, false)).toBe(6);
		expect(commentEnd('<!DOCTYPE html>b', 0, false)).toBe(15);
		expect(commentEnd('<?x a>b', 0, false)).toBe(6);
		expect(commentEnd('</>b', 0, false)).toBe(3);
		expect(commentEnd('<![CDATA[>]]>b', 0, false)).toBe(10);
		expect(commentEnd('<![CDATA[>]]>b', 0, true)).toBe(13);
	});

	it('gives undefined where no comment starts and null when it runs to the end of the page', () => {
		expect(commentEnd('<a>', 0, false)).toBeUndefined();
		expect(commentEnd('</a>', 0, false)).toBeUndefined();
		expect(commentEnd('</', 0, false)).toBeUndefined();
		expect(commentEnd('<!-- a', 0, false)).toBeNull();
		expect(commentEnd('<? a', 0, false)).toBeNull();
	});
});

describe('readTag', () => {
	const attrs = (html: string) => Object.fromEntries(readTag(html, 0)?.attrs ?? []);

	it('reads quoted, unquoted and bare values, with whitespace around the =', () => {
		expect(attrs(`<a b = "1>" c='2' d=3 e>`)).toEqual({ b: '1>', c: '2', d: '3', e: '' });
	});

	it('keeps quotes, < and = inside an unquoted value, and ends it at whitespace or >', () => {
		expect(attrs(`<a b=x'y c=d"e f=g<h=i>`)).toEqual({ b: "x'y", c: 'd"e', f: 'g<h=i' });
	});

	it('starts a new attribute right after a quoted value, and after a /', () => {
		expect(attrs('<a b="1"c=2/d=3>')).toEqual({ b: '1', c: '2/d=3' });
		expect(attrs('<br/onclick=x>')).toEqual({ onclick: 'x' });
		expect(attrs("<a b='1'/c>")).toEqual({ b: '1', c: '' });
	});

	it('reads a leading = as part of the name, lowercases names and keeps the first of a repeated one', () => {
		expect(attrs('<a =b C=1 c=2>')).toEqual({ '=b': '', c: '1' });
		expect(readTag('<DIV>', 0)?.name).toBe('div');
	});

	it('reads an end tag, and no tag where no letter follows or the page ends inside it', () => {
		expect(readTag("</p title='>'>", 0)).toMatchObject({ name: 'p', end: true, close: 14 });
		expect(readTag('< a>', 0)).toBeUndefined();
		expect(readTag('<!-- x -->', 0)).toBeUndefined();
		expect(readTag('<a title="x>', 0)).toBeNull();
	});
});

describe('tags', () => {
	it('gives a script or style its text up to its end tag, and to the end of the page without one', () => {
		const found = [...tags('<style>a</STYLE><script>b<i>"</script>c<script>d')];
		expect(found.map((t) => [t.name, t.end, t.body])).toEqual([
			['style', false, 'a'],
			['style', true, undefined],
			['script', false, 'b<i>"'],
			['script', true, undefined],
			['script', false, 'd'],
		]);
	});

	it('stops at a tag the page ends inside, and reads no tags in plaintext', () => {
		expect([...tags('<b><a title="x <i> <p>')].map((t) => t.name)).toEqual(['b']);
		expect([...tags('<plaintext><script>alert(1)</script>')].map((t) => t.name)).toEqual(['plaintext']);
	});

	it('does not end a script at a longer tag name', () => {
		expect([...tags('<script>a</scripts>b</script>')][0]?.body).toBe('a</scripts>b');
	});
});

describe('offSite', () => {
	it('gives the resolved URL of an off-site value and undefined for a site URL or one that does not parse', () => {
		expect(offSite('/ai-training/a.js')).toBeUndefined();
		expect(offSite('a.js')).toBeUndefined();
		expect(offSite('../../a.js')).toBeUndefined();
		expect(offSite('https://schubergphilis.github.io/a.js')).toBeUndefined();
		expect(offSite('http://schubergphilis.github.io/a.js')).toBe('http://schubergphilis.github.io/a.js');
		expect(offSite('https://schubergphilis.github.io.evil.example/a.js')).toBe(
			'https://schubergphilis.github.io.evil.example/a.js',
		);
		expect(offSite('https://[::1')).toBeUndefined();
	});

	it('decodes a numeric reference without its semicolon, and a named one only when it may lack it', () => {
		expect(offSite('/?a=1&amp;b=2')).toBeUndefined();
		// `&colon` without `;` is no legacy reference, so it stays text and the URL is a relative path.
		expect(offSite('https&colon//evil.example/')).toBeUndefined();
		expect(offSite('https&#58//evil.example/')).toBe('https://evil.example/');
		// The browser decodes once, so `&amp;#58;` becomes the text `&#58;` and the URL is a relative path.
		expect(offSite('https&amp;#58;//evil.example/')).toBeUndefined();
	});
});

describe('srcsetUrls', () => {
	it('splits candidates on commas between them and keeps a comma inside a URL', () => {
		expect(srcsetUrls('a.png 1x, b.png 2x')).toEqual(['a.png', 'b.png']);
		// A comma without whitespace after it stays in the URL, as the browser reads it; trailing commas end it.
		expect(srcsetUrls(' a.png,b.png,, c.png')).toEqual(['a.png,b.png', 'c.png']);
		expect(srcsetUrls('data:image/png,AAA 1x,https://evil.example/x.png 2x')).toEqual([
			'data:image/png,AAA',
			'https://evil.example/x.png',
		]);
		expect(srcsetUrls('a.png (x, y) 1x, b.png')).toEqual(['a.png', 'b.png']);
		expect(srcsetUrls('')).toEqual([]);
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
