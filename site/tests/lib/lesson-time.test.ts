import { LESSON_TIME, lessonTime, statedMinutes, wordCount } from '@lib/lesson-time';
import { describe, expect, it } from 'vitest';

/** `n` words of prose. 180 of them take one minute at `proseWpm`. */
const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');
const time = (src: string) => lessonTime(src, 'x/y');
const cp = 'objective="a/c/o" concepts={[\'c\']} hint="Not counted at all here."';

describe('LESSON_TIME', () => {
	it('holds the rates and base times issue #521 set', () => {
		expect(LESSON_TIME.proseWpm).toBe(180);
		expect(LESSON_TIME.codeWpm).toBe(100);
		expect(LESSON_TIME.exerciseDefaultMinutes).toBe(10);
		expect(LESSON_TIME.honorPredictSeconds).toBe(120);
		expect(LESSON_TIME.warnMinutes).toBe(25);
	});
});

describe('wordCount', () => {
	it('counts tokens with a letter or digit, and skips citations', () => {
		expect(wordCount('One two, three.')).toBe(3);
		expect(wordCount('a -> b = { 1 }')).toBe(3);
		expect(wordCount('A claim (@Brysbaert2019) and (@key, p. 3) more.')).toBe(4);
		expect(wordCount('')).toBe(0);
	});
});

describe('statedMinutes', () => {
	it('reads the last "N minutes" from five to thirty, as a digit or a word', () => {
		expect(statedMinutes('Ten minutes is enough.')).toBe(10);
		expect(statedMinutes('Take 15 minutes, then another twenty minutes.')).toBe(20);
		expect(statedMinutes('About twenty-five minutes.')).toBe(25);
		expect(statedMinutes('Thirty minutes.')).toBe(30);
		expect(statedMinutes('Five minutes.')).toBe(5);
	});
	it('ignores a number outside the range and text without one', () => {
		expect(statedMinutes('Two minutes.')).toBeUndefined();
		expect(statedMinutes('Forty minutes.')).toBeUndefined();
		expect(statedMinutes('1440 minutes in a day. Ten minutes is enough.')).toBe(10);
		expect(statedMinutes('Ten minutes. Then 40 minutes.')).toBe(10);
		expect(statedMinutes('A few minutes.')).toBeUndefined();
		expect(statedMinutes('Ten minute read.')).toBeUndefined();
	});
});

describe('lessonTime: reading', () => {
	it('reads prose at 180 wpm and fenced code at 100 wpm', () => {
		const t = time(`## Heading\n\n${words(179)}\n\n\`\`\`text\n${words(100)}\n\`\`\`\n`);
		expect(t.readingSeconds).toBeCloseTo(60 + 60);
		expect(t.checkpointSeconds).toBe(0);
		expect(t.exerciseSeconds).toBe(0);
	});
	it('counts inline code as prose and skips imports, citations, expressions and HTML tags', () => {
		const src = [
			"import { Choice } from '@components/lesson';",
			'',
			`Use \`git diff\` (@Key-01) ${words(177)}`,
			'',
			'{/* a comment that is never shown */}',
			'',
			`<div class="note">${words(180)}</div>`,
		].join('\n');
		expect(time(src).readingSeconds).toBeCloseTo(120);
	});
	it('counts the prose tags and an ungraded example as prose, with the example output at the code rate', () => {
		const src = [
			`<Pitfall title="Two words">\n${words(88)}\n</Pitfall>`,
			`<Recap>\n${words(45)}\n</Recap>`,
			`<Prompt model="illustrative" recorded="illustrative">\n${words(45)}\n</Prompt>`,
			`<Response model="illustrative" recorded="illustrative">\n${words(45)}\n</Response>`,
			`<Habit id="h">\n${words(45)}\n</Habit>`,
			`<Predict id="ex" title="Three title words" answer={\`${words(100)}\`} run="a/b.py">\n\n${words(87)}\n\n</Predict>`,
		].join('\n\n');
		const t = time(src);
		// 360 prose words (Pitfall title and body, Recap, Prompt, Response, Habit, example title and text) and 100 output words.
		expect(t.readingSeconds).toBeCloseTo(120 + 60);
		expect(t.checkpointSeconds).toBe(0);
	});
	it('gives a widget its fixed time', () => {
		const t = time('<Sampler />\n\n<InstructionsBuilder />\n\n<FormatChecker sample="a/b.txt" />\n');
		expect(t.widgetSeconds).toBe(2 * 180 + 60);
		expect(t.coreMinutes).toBe(7);
	});
	it('fails on a component it has no rule for', () => {
		expect(() => time('Text.\n\n<Carousel slides={3} />\n')).toThrow(
			/x\/y: <Carousel> has no rule in the lesson time estimate/,
		);
		expect(() => time('<Choice id="a" {...rest} />')).toThrow(/spread prop/);
		expect(() => time('<Choice\n')).toThrow(/^x\/y: /);
	});
});

describe('lessonTime: checkpoints', () => {
	it('gives each kind its base time, with the per-step, per-item and per-row times', () => {
		const opts = "options={[{ text: 'A', correct: true }, { text: 'B' }]}";
		const base = (tag: string, props: string) => time(`<${tag} id="i" title="T" ${cp} ${props} />`);
		// Each checkpoint shows one title word, and two option words where it has options.
		const read = (n: number) => (n * 60) / 180;
		expect(base('Choice', opts).checkpointSeconds).toBeCloseTo(20 + read(3));
		expect(base('MultiChoice', opts).checkpointSeconds).toBeCloseTo(30 + read(3));
		expect(
			base('Scenario', "options={[{ text: 'A', correct: true, consequence: 'x' }]}").checkpointSeconds,
		).toBeCloseTo(30 + read(2) + read(0.5));
		expect(base('Order', "steps={['s', 't', 'u']}").checkpointSeconds).toBeCloseTo(10 + 3 * 5 + read(4));
		expect(base('Sort', "buckets={['b', 'c']} items={[{ text: 'i', bucket: 0 }]}").checkpointSeconds).toBeCloseTo(
			10 + 4 + read(4),
		);
		expect(
			base('Match', "options={['o', 'p']} rows={[{ statement: 'r', option: 0 }, { statement: 's', option: 1 }]}")
				.checkpointSeconds,
		).toBeCloseTo(10 + 2 * 5 + read(5));
		expect(base('Repair', 'broken="b c"').checkpointSeconds).toBeCloseTo(90 + read(3));
		expect(base('Predict', 'answer="42"').checkpointSeconds).toBeCloseTo(45 + read(1));
		expect(base('Predict', 'run="a/b.py"').checkpointSeconds).toBeCloseTo(120 + read(1));
	});
	it('reads the stem and half of the feedback, and skips id, objective, concepts, context, hint, answer and run', () => {
		const src = `<Choice id="i" title="T" ${cp} context="${words(500)}" options={[{ text: 'A', correct: true, why: '${words(180)}' }, { text: 'B', why: '${words(180)}' }]}>\n\n${words(177)}\n\n</Choice>`;
		// 20 s base, 180 shown words (title, options, stem) and half of 360 feedback words.
		expect(time(src).checkpointSeconds).toBeCloseTo(20 + 60 + 60);
		const match = `<Match id="m" title="T" ${cp} options={['o']} rows={[{ statement: 'r', option: 0, why: '${words(90)}' }, { statement: 's', option: 0 }]} rationale="${words(90)}" />`;
		expect(time(match).checkpointSeconds).toBeCloseTo(10 + 10 + (4 * 60) / 180 + 30);
		const repair = `<Repair id="r" title="T" ${cp} broken="b" model="${words(360)}" />`;
		expect(time(repair).checkpointSeconds).toBeCloseTo(90 + (2 * 60) / 180 + 60);
		const predict = `<Predict id="p" title="T" ${cp} answer="${words(100)}" run="a/b.py" />`;
		expect(time(predict).checkpointSeconds).toBeCloseTo(45 + 60 / 180);
	});
	it('counts only first checkpoints: a review alternate and the MorePractice block add nothing', () => {
		const first = `<Choice id="a" title="T" ${cp} options={[{ text: 'A', correct: true }]} />`;
		const review = `<Choice id="b" phase="review" title="T" ${cp} options={[{ text: 'A', correct: true }]} />`;
		const practice = `<MorePractice>\n\n${words(90)}\n\n<Choice id="c" phase="practice" title="T" ${cp} options={[{ text: 'A', correct: true }]} />\n\n</MorePractice>`;
		const one = time(first).checkpointSeconds;
		const all = time(`${first}\n\n<Exercise>\nDo it.\n</Exercise>\n\n${review}\n\n${practice}`);
		expect(all.checkpointSeconds).toBeCloseTo(one);
		expect(all.readingSeconds).toBe(0);
	});
});

describe('lessonTime: exercise', () => {
	it('uses the stated time when the brief gives one, and adds the brief at the prose rate', () => {
		const t = time(`<Exercise stretch="${words(500)}">\n\n${words(176)}. Fifteen minutes is enough.\n\n</Exercise>`);
		expect(t.exerciseSeconds).toBeCloseTo(15 * 60 + 60);
		expect(t.readingSeconds).toBe(0);
	});
	it('uses ten minutes when the brief states none, and reads its fences at the prose rate', () => {
		const t = time(`<Exercise>\n\n${words(80)}\n\n\`\`\`sh\n${words(100)}\n\`\`\`\n\n</Exercise>`);
		expect(t.exerciseSeconds).toBeCloseTo(10 * 60 + 60);
	});
});

describe('lessonTime: totals', () => {
	it('keeps the exercise out of coreMinutes and rounds the total to five minutes, at least five', () => {
		const t = time(`${words(180 * 7)}\n\n<Exercise>\nTen minutes is enough.\n</Exercise>\n`);
		expect(t.coreMinutes).toBeCloseTo(7);
		expect(t.totalMinutes).toBeCloseTo(7 + 10 + 4 / 180);
		expect(t.minutes).toBe(15);
		expect(time('Short.').minutes).toBe(5);
		expect(time(words(180 * 13)).minutes).toBe(15);
	});
});
