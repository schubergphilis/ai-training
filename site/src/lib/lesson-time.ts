import { type CheckpointTag, KIND_OF_TAG, MORE_PRACTICE_TAG } from './checkpoint-rules';
import {
	attrsOf,
	type CheckpointAttr,
	childrenSource,
	isJsxElement,
	type JsxElement,
	type MdxNode,
	parseMdx,
	phaseProp,
} from './checkpoint-tags';

/**
 * The time estimate of a live lesson, read from its page (spec S03 "Lesson
 * time"). The course plan table (`components/CoursePlan.astro`) shows the
 * rounded estimate in place of the plan's `minutes` target, and
 * `mise run data` (`scripts/lib/data.mjs`) warns when a lesson's reading,
 * checkpoints and widgets alone are over `LESSON_TIME.warnMinutes`. The tags are read
 * with the checkpoint tag reader (`lib/checkpoint-tags.ts`), so a prop reads
 * the same here as on the rendered page. No Astro import, so both callers can
 * load it.
 *
 * The constants are not calibrated against timed readers yet (issue #521).
 * Each one says where its value comes from.
 */
export const LESSON_TIME = {
	/**
	 * Prose reading rate in words per minute. Brysbaert (2019) measured adult
	 * silent reading of non-fiction at 238 wpm; 180 allows for study reading and
	 * for readers of English as a second language.
	 */
	proseWpm: 180,
	/** Reading rate for words in code and text fences, set by the issue #521 prototype: slower than prose, because a reader takes code token by token. */
	codeWpm: 100,
	/**
	 * Base seconds per `first` checkpoint, by tag, for the answering itself.
	 * The reading of the shown words comes on top. Picked for the prototype
	 * estimator of issue #521: a click is quick, a drag per step, row or item
	 * is added below, and a rewrite (`Repair`) or a run-and-compare (honor
	 * `Predict`) takes minutes.
	 */
	checkpointSeconds: {
		Choice: 20,
		MultiChoice: 30,
		Scenario: 30,
		Order: 10,
		Sort: 10,
		Match: 10,
		Repair: 90,
		Predict: 45,
	} satisfies Record<CheckpointTag, number>,
	/** A `Predict` with no `answer`: the learner runs it and grades their own guess (issue #521 prototype). */
	honorPredictSeconds: 120,
	/** Seconds added per step of an `Order`, per item of a `Sort` and per row of a `Match` (issue #521 prototype). */
	perStepSeconds: 5,
	perItemSeconds: 4,
	perRowSeconds: 5,
	/** The share of the feedback words (`why`, `consequence`, `rationale`, `model`) a learner reads (issue #521 prototype). */
	feedbackShare: 0.5,
	/**
	 * Exercise minutes when the brief states none: the median of the 50
	 * exercises that stated a time when issue #521 was written (29 `do`, 21
	 * `judge`), 10 for both kinds.
	 */
	exerciseDefaultMinutes: 10,
	/** The range of an exercise's own `N minutes` that counts as its stated time. */
	exerciseStatedMin: 5,
	exerciseStatedMax: 30,
	/**
	 * Fixed seconds for an interactive widget, whose time the page text does not
	 * show. Three minutes is the start issue #521 set. A new widget needs an
	 * entry here, or the estimate fails.
	 */
	widgetSeconds: { Sampler: 180, InstructionsBuilder: 180 } as Record<string, number>,
	/** The shown estimate is rounded to this many minutes, because the constants are not calibrated. */
	roundToMinutes: 5,
	/** `mise run data` warns when reading, checkpoints and widgets alone are over this (spec S03 "Length"). */
	warnMinutes: 25,
};

/** Components whose children are prose on the page. `Pitfall` shows its `title` too. */
const PROSE_TAGS = new Set(['Pitfall', 'Recap', 'Prompt', 'Response', 'Habit']);

/** The number words an exercise may state its time in, five to thirty. */
const NUMBER_WORDS: Record<string, number> = (() => {
	const units = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
	const teens = [
		'ten',
		'eleven',
		'twelve',
		'thirteen',
		'fourteen',
		'fifteen',
		'sixteen',
		'seventeen',
		'eighteen',
		'nineteen',
	];
	const out: Record<string, number> = {};
	units.forEach((w, i) => {
		out[w] = i + 1;
		out[`twenty-${w}`] = 21 + i;
		out[`twenty ${w}`] = 21 + i;
	});
	teens.forEach((w, i) => {
		out[w] = 10 + i;
	});
	out.twenty = 20;
	out.thirty = 30;
	return out;
})();
const STATED_TIME = new RegExp(
	`\\b(\\d+|${Object.keys(NUMBER_WORDS)
		.sort((a, b) => b.length - a.length)
		.join('|')})\\s+minutes\\b`,
	'gi',
);
const CITATION = /\(@[^()]+?\)/g;

/** The words in `text`: whitespace-separated tokens with at least one letter or digit. Citations `(@key)` don't count. */
export function wordCount(text: string): number {
	return text
		.replace(CITATION, ' ')
		.split(/\s+/)
		.filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/**
 * The time an exercise states for itself: the last `N minutes` in `text`
 * with N a number or a number word from `exerciseStatedMin` to
 * `exerciseStatedMax`. `undefined` when there is none.
 */
export function statedMinutes(text: string): number | undefined {
	let last: number | undefined;
	for (const m of text.matchAll(STATED_TIME)) {
		const raw = (m[1] ?? '').toLowerCase().replace(/\s+/g, ' ');
		const n = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
		if (n !== undefined && n >= LESSON_TIME.exerciseStatedMin && n <= LESSON_TIME.exerciseStatedMax) last = n;
	}
	return last;
}

/** The estimate of one lesson, in seconds per part, before rounding. */
export interface LessonTime {
	/** Prose and fences outside checkpoints and the exercise. */
	readingSeconds: number;
	/** The `first` checkpoints: base time, shown words and a share of the feedback. */
	checkpointSeconds: number;
	/** The fixed time of the page's widgets. */
	widgetSeconds: number;
	/** The exercise: its stated time or the default, plus reading its brief. */
	exerciseSeconds: number;
	/** Reading, checkpoints and widgets, in minutes: what `warnMinutes` is compared with. */
	coreMinutes: number;
	/** Every part, in minutes, unrounded. */
	totalMinutes: number;
	/** `totalMinutes` rounded to `roundToMinutes`, at least `roundToMinutes`. What the course plan shows. */
	minutes: number;
}

interface Words {
	prose: number;
	code: number;
}
const seconds = (w: Words, codeAtProseRate = false) =>
	(w.prose * 60) / LESSON_TIME.proseWpm +
	(w.code * 60) / (codeAtProseRate ? LESSON_TIME.proseWpm : LESSON_TIME.codeWpm);

/** The words of a string prop, or of a list of strings (`buckets`, `steps`, a `Match`'s `options`). */
function stringWords(value: unknown): number {
	if (typeof value === 'string') return wordCount(value);
	if (!Array.isArray(value)) return 0;
	return value.reduce((n: number, v) => n + (typeof v === 'string' ? wordCount(v) : 0), 0);
}
/** The words under `keys` of each object in a list prop (`options`, `items`, `rows`). */
function fieldWords(value: unknown, keys: readonly string[]): number {
	if (!Array.isArray(value)) return 0;
	let n = 0;
	for (const v of value) {
		if (v && typeof v === 'object') for (const k of keys) n += stringWords((v as Record<string, unknown>)[k]);
	}
	return n;
}
const lengthOf = (attrs: Map<string, CheckpointAttr>, name: string) => {
	const v = attrs.get(name)?.value;
	return Array.isArray(v) ? v.length : 0;
};

/**
 * The time estimate of the lesson page `src` (MDX, without frontmatter).
 * `where` names the lesson in errors. A component the estimate has no rule
 * for throws, so a new one gets a rule before it counts as zero.
 */
export function lessonTime(src: string, where: string): LessonTime {
	let tree: MdxNode;
	try {
		tree = parseMdx(src);
	} catch (e) {
		throw new Error(`${where}: ${(e as Error).message}`);
	}
	const reading: Words = { prose: 0, code: 0 };
	const checkpointWords: Words = { prose: 0, code: 0 };
	const exerciseWords: Words = { prose: 0, code: 0 };
	let checkpointBase = 0;
	let feedbackWords = 0;
	let widgetSeconds = 0;
	let exerciseBase = 0;

	const walk = (node: MdxNode, into: Words): void => {
		switch (node.type) {
			case 'text':
			case 'inlineCode':
				into.prose += wordCount((node as MdxNode & { value: string }).value);
				return;
			case 'code':
				into.code += wordCount((node as MdxNode & { value: string }).value);
				return;
			// Import lines, `{...}` expressions and raw HTML are not read.
			case 'mdxjsEsm':
			case 'mdxFlowExpression':
			case 'mdxTextExpression':
			case 'html':
				return;
		}
		if (isJsxElement(node)) {
			element(node, into);
			return;
		}
		for (const child of node.children ?? []) walk(child, into);
	};

	const element = (node: JsxElement, into: Words): void => {
		const name = node.name;
		const children = () => {
			for (const child of node.children) walk(child, into);
		};
		// A fragment or a lowercase (HTML) tag: the tag doesn't count, its text does.
		if (name === null || /^[a-z]/.test(name)) {
			children();
			return;
		}
		if (PROSE_TAGS.has(name)) {
			into.prose += stringWords(attrsOf(node, where).get('title')?.value);
			children();
			return;
		}
		// Optional practice after the exercise (spec S03 "More practice").
		if (name === MORE_PRACTICE_TAG) return;
		if (name === 'Exercise') {
			// The `stretch` prop is optional and doesn't count.
			const stated = statedMinutes(childrenSource(node, src));
			exerciseBase += (stated ?? LESSON_TIME.exerciseDefaultMinutes) * 60;
			for (const child of node.children) walk(child, exerciseWords);
			return;
		}
		const widget = LESSON_TIME.widgetSeconds[name];
		if (widget !== undefined) {
			widgetSeconds += widget;
			return;
		}
		if (name in KIND_OF_TAG) {
			checkpoint(node, name as CheckpointTag, into);
			return;
		}
		throw new Error(
			`${where}: <${name}> has no rule in the lesson time estimate; add it to src/lib/lesson-time.ts (a prose tag, a widget time or a checkpoint kind)`,
		);
	};

	const checkpoint = (node: JsxElement, tag: CheckpointTag, into: Words): void => {
		const attrs = attrsOf(node, where);
		const id = attrs.get('id')?.value;
		const title = stringWords(attrs.get('title')?.value);
		// A Predict with no objective is an ungraded example (spec S03 "Examples"): prose on the page,
		// and the page shows its output (`answer`), read at the code rate.
		if (tag === 'Predict' && !attrs.has('objective')) {
			into.prose += title;
			into.code += stringWords(attrs.get('answer')?.value);
			for (const child of node.children) walk(child, into);
			return;
		}
		// A `review` alternate is hidden on the lesson page.
		if (phaseProp(`${where}#${typeof id === 'string' ? id : tag}`, attrs) !== 'first') return;
		let base = LESSON_TIME.checkpointSeconds[tag];
		if (tag === 'Predict' && !attrs.has('answer')) base = LESSON_TIME.honorPredictSeconds;
		if (tag === 'Order') base += LESSON_TIME.perStepSeconds * lengthOf(attrs, 'steps');
		if (tag === 'Sort') base += LESSON_TIME.perItemSeconds * lengthOf(attrs, 'items');
		if (tag === 'Match') base += LESSON_TIME.perRowSeconds * lengthOf(attrs, 'rows');
		checkpointBase += base;
		checkpointWords.prose +=
			title +
			stringWords(attrs.get('options')?.value) +
			fieldWords(attrs.get('options')?.value, ['text']) +
			stringWords(attrs.get('buckets')?.value) +
			fieldWords(attrs.get('items')?.value, ['text']) +
			stringWords(attrs.get('steps')?.value) +
			fieldWords(attrs.get('rows')?.value, ['statement']) +
			stringWords(attrs.get('broken')?.value);
		for (const child of node.children) walk(child, checkpointWords);
		feedbackWords +=
			fieldWords(attrs.get('options')?.value, ['why', 'consequence']) +
			fieldWords(attrs.get('items')?.value, ['why']) +
			fieldWords(attrs.get('rows')?.value, ['why']) +
			stringWords(attrs.get('rationale')?.value) +
			stringWords(attrs.get('model')?.value);
	};

	walk(tree, reading);

	const readingSeconds = seconds(reading);
	const checkpointSeconds =
		checkpointBase + seconds(checkpointWords) + (feedbackWords * LESSON_TIME.feedbackShare * 60) / LESSON_TIME.proseWpm;
	// The brief is read at the prose rate, fences included.
	const exerciseSeconds = exerciseBase + seconds(exerciseWords, true);
	const coreMinutes = (readingSeconds + checkpointSeconds + widgetSeconds) / 60;
	const totalMinutes = coreMinutes + exerciseSeconds / 60;
	const step = LESSON_TIME.roundToMinutes;
	return {
		readingSeconds,
		checkpointSeconds,
		widgetSeconds,
		exerciseSeconds,
		coreMinutes,
		totalMinutes,
		minutes: Math.max(step, Math.round(totalMinutes / step) * step),
	};
}
