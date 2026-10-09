import type { Area, Group } from './areas';
import type { CheckpointAttr } from './checkpoint-tags';

/**
 * The figures of the About page (issue #762): the data, scales and text the
 * components in `components/about/` draw, and the Markdown each one becomes in
 * the page's alternate (spec S12). A component that draws a content count
 * reads it from the build figures (`lib/about-figures.ts`) by key. A figure
 * from the project's history is written in the page as a prop, next to its
 * `source:` comment, because the build can't count it.
 */

/** The figures of the build, by key, as `getAboutFigures` returns them. */
export type Figures = Map<string, number>;

/** One figure as a number. An unknown key fails the build with the keys there are. */
export function figureValue(figures: Figures, key: string): number {
	const value = figures.get(key);
	if (value === undefined) {
		const known = [...figures.keys()].sort().join(', ');
		throw new Error(`about.mdx: the figure "${key}" doesn't exist. Known figures: ${known}`);
	}
	return value;
}

/** A number with a thousands separator, as the page writes it. */
export const formatNumber = (n: number) => n.toLocaleString('en-US');

/** A row or tile with a value: a build figure by key (`of`), or a number from the page (`value`). */
export interface Valued {
	of?: string;
	value?: number;
}

/** The value of a row: its figure, or its own number. One of the two, never both. */
export function rowValue(figures: Figures, row: Valued, where: string): number {
	if (row.of !== undefined && row.value !== undefined)
		throw new Error(`about.mdx: ${where} has both of="${row.of}" and value=${row.value}; give one`);
	if (row.of !== undefined) return figureValue(figures, row.of);
	if (typeof row.value === 'number') return row.value;
	throw new Error(`about.mdx: ${where} needs of="<figure key>" or value={<number>}`);
}

/** One tile of `<Stats>`: a big number and what it counts. */
export interface StatItem extends Valued {
	label: string;
}

/** One bar of `<BarChart>`. `group` starts a new labeled block of bars. */
export interface BarRow extends Valued {
	label: string;
	note?: string;
	group?: string;
}

/** A bar ready to draw: its value, the text shown and its length as a fraction of the longest bar. */
export interface Bar {
	label: string;
	note?: string;
	group?: string;
	value: number;
	text: string;
	fraction: number;
}

/** The bars of a chart, each scaled against the largest value. All zero gives zero-length bars. */
export function barsOf(figures: Figures, rows: BarRow[]): Bar[] {
	const values = rows.map((r, i) => rowValue(figures, r, `bar ${i + 1} ("${r.label}")`));
	const max = Math.max(0, ...values);
	return rows.map((r, i) => {
		const value = values[i] as number;
		return { ...r, value, text: formatNumber(value), fraction: max > 0 ? value / max : 0 };
	});
}

/**
 * `text` broken into lines of at most `width` characters, at spaces. SVG text doesn't wrap, so a
 * figure wraps its longer labels here. A word longer than `width` gets a line of its own.
 */
export function wrapText(text: string, width: number): string[] {
	const lines: string[] = [];
	let line = '';
	for (const word of text.split(/\s+/).filter(Boolean)) {
		if (line && line.length + 1 + word.length > width) {
			lines.push(line);
			line = word;
		} else line = line ? `${line} ${word}` : word;
	}
	if (line) lines.push(line);
	return lines;
}

/** One row of `<Intervals>`: what comes back, and the days after which it does. */
export interface IntervalRow {
	label: string;
	days: number[];
}

/**
 * The position of `day` on a day axis that ends at `max`, from 0 to 1. The scale is a square root, so the
 * short early steps of a schedule stay apart while the last step still fits.
 */
export function dayPosition(day: number, max: number): number {
	if (max <= 0) return 0;
	return Math.sqrt(Math.max(0, Math.min(day, max)) / max);
}

/** One point of the lesson count in `<GrowthChart>`: the count of live lessons at the end of a day. */
export interface GrowthPoint {
	date: string;
	lessons: number;
}

/** One event in `<GrowthChart>`, on one day or from `date` to `end`. */
export interface GrowthEvent {
	date: string;
	end?: string;
	text: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `date`, both `YYYY-MM-DD`. A malformed date fails the build. */
export function daysBetween(from: string, date: string): number {
	const parse = (d: string) => {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`about.mdx: "${d}" is no date; write YYYY-MM-DD`);
		return Date.parse(`${d}T00:00:00Z`);
	};
	return Math.round((parse(date) - parse(from)) / DAY_MS);
}

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
];

/** `2026-09-25` as `September 25`, and a range as `September 25 to 27` or `September 30 to October 2`. */
export function dayLabel(date: string, end?: string): string {
	const part = (d: string) => {
		const [, m, day] = d.split('-').map(Number);
		return { month: MONTHS[(m ?? 1) - 1] as string, day: day ?? 1 };
	};
	const a = part(date);
	if (!end) return `${a.month} ${a.day}`;
	const b = part(end);
	return b.month === a.month ? `${a.month} ${a.day} to ${b.day}` : `${a.month} ${a.day} to ${b.month} ${b.day}`;
}

/** One block of `<Adopted>`: a source the project learned from, and what it took. */
export interface AdoptedRow {
	source: string;
	adopted: string[];
}

/** One block of `<Controls>`: where a control is, and each control with what it prevents. */
export interface ControlGroup {
	name: string;
	controls: { control: string; prevents: string }[];
}

/** The six areas in group order with their counts, for `<AreaChart>`. */
export interface AreaFigures {
	group: Group;
	areas: (Area & { lessons: number; topics: number; checkpoints: number })[];
}

/** The areas of each group with the counts `<AreaChart>` draws. */
export function areaFiguresOf(figures: Figures, groups: Group[], areas: Area[]): AreaFigures[] {
	return groups.map((group) => ({
		group,
		areas: areas
			.filter((a) => a.group === group.id)
			.map((a) => ({
				...a,
				lessons: figureValue(figures, `lessons:${a.slug}`),
				topics: figureValue(figures, `topics:${a.slug}`),
				checkpoints: figureValue(figures, `checkpoints:${a.slug}`),
			})),
	}));
}

/** The prop `name` of a component in the alternate, or an error that names the component. */
function propOf<T>(attrs: Map<string, CheckpointAttr>, name: string, component: string): T {
	const attr = attrs.get(name);
	if (attr === undefined) throw new Error(`about.mdx: <${component}> needs the prop ${name}`);
	return attr.value as T;
}

/** A Markdown table cell: one line, with its pipes escaped. */
const cell = (text: string) => text.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();

function table(head: string[], rows: string[][]): string {
	return [
		`| ${head.map(cell).join(' | ')} |`,
		`| ${head.map(() => '---').join(' | ')} |`,
		...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
	].join('\n');
}

/** What the alternate needs besides the props: the build figures, and the groups and areas. */
export interface AboutContext {
	figures: Figures;
	groups: Group[];
	areas: Area[];
}

/**
 * The Markdown of each About component in the alternate (spec S12), by component name. A figure becomes a
 * table or a list with the same numbers. A drawing that only shows what the prose next to it says, such as
 * the parts of a lesson, becomes nothing, as a widget does.
 */
export function aboutMarkdown(ctx: AboutContext): Record<string, (attrs: Map<string, CheckpointAttr>) => string> {
	const { figures } = ctx;
	const f = (key: string) => formatNumber(figureValue(figures, key));
	return {
		AboutFigure: (attrs) => f(String(propOf(attrs, 'of', 'AboutFigure'))),
		Stats: (attrs) =>
			propOf<StatItem[]>(attrs, 'items', 'Stats')
				.map((s, i) => `- ${formatNumber(rowValue(figures, s, `tile ${i + 1}`))} ${s.label}`)
				.join('\n'),
		BarChart: (attrs) => {
			const bars = barsOf(figures, propOf<BarRow[]>(attrs, 'rows', 'BarChart'));
			const unit = String(attrs.get('unit')?.value ?? 'Count');
			const label = String(attrs.get('label')?.value ?? '');
			const grouped = bars.some((b) => b.group);
			const notes = bars.some((b) => b.note);
			let group = '';
			const rows = bars.map((b) => {
				if (b.group) group = b.group;
				return [...(grouped ? [group] : []), b.label, ...(notes ? [b.note ?? ''] : []), b.text];
			});
			return table([...(grouped ? ['Group'] : []), label, ...(notes ? ['Note'] : []), unit], rows);
		},
		AreaChart: () =>
			table(
				['Area', 'Group', 'What it covers', 'Lessons', 'Topics', 'Checkpoints'],
				areaFiguresOf(figures, ctx.groups, ctx.areas).flatMap((g) =>
					g.areas.map((a) => [
						a.name,
						g.group.name,
						a.description,
						formatNumber(a.lessons),
						formatNumber(a.topics),
						formatNumber(a.checkpoints),
					]),
				),
			),
		ContentModel: () =>
			[
				`- ${f('groups')} groups with ${f('areas')} areas. Each area has one course, ${f('course-parts')} course parts in all.`,
				`- ${f('lessons')} lessons. They have ${f('checkpoints')} graded checkpoints, ${f('checkpoints-review')} more for review only, ${f('exercises')} exercises and ${f('habits')} habits.`,
				`- ${f('topics')} topics with ${f('concepts')} concepts. A lesson covers one topic.`,
				`- ${f('competencies')} competencies with ${f('objectives')} learning objectives and ${f('behaviors')} behaviors. A lesson serves objectives, and a checkpoint tests one.`,
			].join('\n'),
		Intervals: (attrs) =>
			propOf<IntervalRow[]>(attrs, 'rows', 'Intervals')
				.map((r) => `- ${r.label}: on days ${r.days.join(', ')} after the lesson`)
				.join('\n'),
		GrowthChart: (attrs) => {
			const points = propOf<GrowthPoint[]>(attrs, 'points', 'GrowthChart');
			const events = propOf<GrowthEvent[]>(attrs, 'events', 'GrowthChart');
			return [
				table(
					['Date', 'What happened'],
					events.map((e) => [dayLabel(e.date, e.end), e.text]),
				),
				table(
					['End of day', 'Lessons'],
					points.map((p) => [dayLabel(p.date), formatNumber(p.lessons)]),
				),
			].join('\n\n');
		},
		Adopted: (attrs) =>
			propOf<AdoptedRow[]>(attrs, 'rows', 'Adopted')
				.map((r) => `- ${r.source}: ${r.adopted.join('; ')}`)
				.join('\n'),
		Controls: (attrs) =>
			table(
				['Where', 'Control', 'What it prevents'],
				propOf<ControlGroup[]>(attrs, 'groups', 'Controls').flatMap((g) =>
					g.controls.map((c) => [g.name, c.control, c.prevents]),
				),
			),
		LessonAnatomy: () => '',
		WaveDiagram: () => '',
		ArchitectureDiagram: () => '',
	};
}

/** Item `i` of a drawing's coordinate list. An index past the end is a bug in the drawing. */
export function nth(list: readonly number[], i: number): number {
	const v = list[i];
	if (v === undefined) throw new Error(`about figure: no coordinate ${i} in [${list.join(', ')}]`);
	return v;
}
