#!/usr/bin/env bun
/**
 * A plain static server for site/dist, used by the Playwright suite
 * (playwright.config.ts `webServer`) and `scripts/screenshot.mjs`.
 *
 * Why not `astro preview`: in Astro 7 the preview command hands the port to a
 * detached child and exits, so a supervisor that starts it cannot stop it.
 * (The old shell wrapper needed `pkill` for that reason.) This one stays in
 * the foreground and dies with its parent. It serves the same files under
 * the same `/ai-training` base path the built site expects.
 *
 * Usage: `bun scripts/serve-dist.mjs [port]`. Without the argument the port is
 * `E2E_PORT`, and without that 4400. The e2e run passes a free port
 * (playwright.config.ts), so 4400 is only the default for a run by hand.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = '/ai-training';
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.argv[2] ?? process.env.E2E_PORT ?? 4400);

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
	'.xml': 'application/xml; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
	// As GitHub Pages serves a Markdown alternate (spec S12 "URL scheme").
	'.md': 'text/markdown; charset=utf-8',
	'.pdf': 'application/pdf',
};

/** The percent-decoded path, or null when an escape is malformed (`%E0%A4%A`). */
function decodePath(pathname) {
	try {
		return decodeURIComponent(pathname);
	} catch {
		return null;
	}
}

/** The file under dist/ for a request path, or null when there is none. */
function resolve(pathname) {
	if (pathname !== BASE && !pathname.startsWith(`${BASE}/`)) return null;
	const decoded = decodePath(pathname.slice(BASE.length));
	if (decoded === null) return null;
	const rel = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
	const candidates = rel.endsWith('/') || rel === '' ? [join(rel, 'index.html')] : [rel, join(rel, 'index.html')];
	for (const c of candidates) {
		const file = join(dist, c);
		if (file.startsWith(dist) && existsSync(file) && statSync(file).isFile()) return file;
	}
	return null;
}

function send(res, status, file) {
	res.writeHead(status, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
	createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
	const url = new URL(req.url ?? '/', `http://localhost:${port}`);
	// A malformed percent escape must not take the shared e2e server down with a URIError.
	if (decodePath(url.pathname) === null) {
		res.writeHead(400, { 'content-type': 'text/plain' });
		return res.end('bad request: malformed percent-encoding');
	}
	const file = resolve(url.pathname);
	if (file) return send(res, 200, file);
	// A directory without a trailing slash: redirect like a static host would.
	if (!url.pathname.endsWith('/') && resolve(`${url.pathname}/`)) {
		res.writeHead(301, { location: `${url.pathname}/${url.search}` });
		return res.end();
	}
	const notFound = join(dist, '404.html');
	if (existsSync(notFound)) return send(res, 404, notFound);
	res.writeHead(404, { 'content-type': 'text/plain' });
	res.end('not found');
});

server.listen(port, '127.0.0.1', () => {
	console.log(`serving ${dist} at http://localhost:${port}${BASE}/`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => {
		server.close();
		process.exit(0);
	});
}
