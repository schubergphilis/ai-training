import {
	DATA_INDEX_VERSION,
	dataFiles,
	dataFilesOf,
	dataIndexOf,
	dataJson,
	publishedData,
	publishedPath,
} from '@lib/data-files';
import { describe, expect, it } from 'vitest';

const site = 'https://schubergphilis.github.io';
const ROOT = 'https://schubergphilis.github.io/ai-training';

describe('publishedPath', () => {
	it('maps each data-tree file to its path under /data/ per S12 "Files"', () => {
		expect(publishedPath('groups.yaml')).toBe('groups');
		expect(publishedPath('areas/safety/area.yaml')).toBe('areas/safety');
		expect(publishedPath('areas/safety/topics/agent-risk.yaml')).toBe('topics/safety/agent-risk');
		expect(publishedPath('areas/safety/competencies/judges-agent-risk.yaml')).toBe(
			'competencies/safety/judges-agent-risk',
		);
		expect(publishedPath('areas/safety/courses/safety.yaml')).toBe('courses/safety');
		expect(publishedPath('areas/safety/lessons/agent-risk.yaml')).toBe('lesson-plans/safety/agent-risk');
	});
	it('publishes neither the bibliography nor an alignment file nor any other file', () => {
		expect(publishedPath('bibliography.yaml')).toBeNull();
		expect(publishedPath('alignment/ai-fluency-4d.yaml')).toBeNull();
		expect(publishedPath('areas/safety/other/x.yaml')).toBeNull();
		expect(publishedPath('areas/safety/topics/deep/x.yaml')).toBeNull();
	});
});

describe('publishedData', () => {
	it('drops the top-level notes and each course part notes and keeps the other keys in order', () => {
		const out = publishedData({
			id: 'a',
			notes: 'n',
			'plan-issue': 3,
			parts: [
				{ title: 'P', notes: 'pn', lessons: ['a/x'] },
				{ title: 'Q', lessons: ['a/y'] },
			],
		});
		expect(JSON.stringify(out)).toBe(
			'{"id":"a","plan-issue":3,"parts":[{"title":"P","lessons":["a/x"]},{"title":"Q","lessons":["a/y"]}]}',
		);
	});
	it('returns a list or a scalar as is', () => {
		const groups = [{ id: 'g', notes: 'kept' }];
		expect(publishedData(groups)).toBe(groups);
		expect(publishedData(null)).toBeNull();
	});
});

describe('dataFilesOf', () => {
	it('parses each published file, keeps a date a string, and sorts by path', () => {
		const files = dataFilesOf({
			'bibliography.yaml': 'k: {}\n',
			'areas/a/lessons/x.yaml': 'id: a/x\nsources-checked: 2026-09-26\nnotes: n\n',
			'areas/a/area.yaml': 'id: a\n',
		});
		expect(files).toEqual([
			{ path: 'areas/a', data: { id: 'a' } },
			{ path: 'lesson-plans/a/x', data: { id: 'a/x', 'sources-checked': '2026-09-26' } },
		]);
	});
});

describe('dataFiles', () => {
	it('reads the real tree: groups and one file per area', () => {
		const paths = dataFiles().map((f) => f.path);
		expect(paths).toContain('groups');
		expect(paths).toContain('areas/safety');
		expect(paths).toContain('courses/safety');
		expect(paths.some((p) => p.startsWith('lesson-plans/safety/'))).toBe(true);
		expect(paths.some((p) => p.includes('bibliography') || p.includes('alignment'))).toBe(false);
	});
});

describe('dataJson', () => {
	it('is two-space JSON with a final newline', () => {
		expect(dataJson({ a: [1] })).toBe('{\n  "a": [\n    1\n  ]\n}\n');
	});
});

describe('dataIndexOf', () => {
	const files = dataFilesOf({
		'groups.yaml': '- id: two\n  order: 2\n  areas: [b]\n- id: one\n  order: 1\n  areas: [a, missing]\n',
		'areas/a/area.yaml': 'id: a\n',
		'areas/b/area.yaml': 'id: b\n',
		'areas/a/topics/t.yaml': 'id: a/t\n',
		'areas/a/competencies/c.yaml': 'id: a/c\n',
		'areas/a/courses/a.yaml':
			'id: a\narea: a\nparts:\n  - title: P\n    lessons: [a/y]\n  - title: Q\n    lessons: [a/x]\n',
		'areas/a/lessons/x.yaml': 'id: a/x\n',
		'areas/a/lessons/y.yaml': 'id: a/y\n',
		'areas/b/courses/b.yaml': 'id: b\narea: b\nlessons: [b/z]\n',
		'areas/b/lessons/z.yaml': 'id: b/z\n',
	});
	const index = dataIndexOf(files, new Set(['a/x']), site);

	it('has the version and the absolute groups and checkpoints URLs', () => {
		expect(index.version).toBe(DATA_INDEX_VERSION);
		expect(index.groups).toBe(`${ROOT}/data/groups.json`);
		expect(index.checkpoints).toBe(`${ROOT}/data/checkpoints.json`);
	});
	it('lists areas in group order and skips a group entry without an area file', () => {
		expect(index.areas.map((a) => a.id)).toEqual(['a', 'b']);
		const [a] = index.areas;
		expect(a).toMatchObject({ url: `${ROOT}/data/areas/a.json`, page: `${ROOT}/a/` });
	});
	it('lists topics, competencies and courses with their URLs', () => {
		const [a] = index.areas;
		expect(a?.topics).toEqual([{ id: 'a/t', url: `${ROOT}/data/topics/a/t.json`, page: `${ROOT}/topics/a/t/` }]);
		expect(a?.competencies).toEqual([
			{ id: 'a/c', url: `${ROOT}/data/competencies/a/c.json`, page: `${ROOT}/competencies/a/c/` },
		]);
		expect(a?.courses).toEqual([{ id: 'a', url: `${ROOT}/data/courses/a.json` }]);
	});
	it('lists lessons in course order, a live one with page and bundle, a planned one with null', () => {
		const [a, b] = index.areas;
		expect(a?.lessons).toEqual([
			{ id: 'a/y', plan: `${ROOT}/data/lesson-plans/a/y.json`, live: false, page: null, bundle: null },
			{
				id: 'a/x',
				plan: `${ROOT}/data/lesson-plans/a/x.json`,
				live: true,
				page: `${ROOT}/a/x/`,
				bundle: `${ROOT}/data/lessons/a/x.json`,
			},
		]);
		expect(b?.lessons.map((l) => l.id)).toEqual(['b/z']);
	});
});
