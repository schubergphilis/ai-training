// @vitest-environment happy-dom
/**
 * Binds `competency-map.ts` to a hand-written copy of the markup
 * `CompetencyMap.astro` renders. If the component's markup changes, the
 * fixture here changes with it, and the e2e suite checks that the two still
 * agree.
 */
import { mountCompetencyMap } from '@scripts/competency-map';
import type { CompetencyCoverage } from '@scripts/competency-map-model';
import * as progress from '@scripts/progress';
import { beforeEach, describe, expect, it } from 'vitest';

const coverage: CompetencyCoverage[] = [
	{
		id: 'a/c',
		objectives: [
			{ id: 'a/c/x', lessons: ['a/one'] },
			{ id: 'a/c/y', lessons: ['a/two'] },
		],
	},
];

function render() {
	document.body.innerHTML = `
	<div class="topic-map competency-map" data-competency-map data-coverage='${JSON.stringify(coverage)}'>
		<div class="competency-node" data-competency="a/c" data-state="untouched">
			<a class="competency-objective" data-objective="a/c/x" data-state="untouched"></a>
			<a class="competency-objective" data-objective="a/c/y" data-state="untouched"></a>
		</div>
		<div class="competency-node" data-competency="a/unknown" data-state="untouched"></div>
	</div>`;
}

const state = (sel: string) => document.querySelector<HTMLElement>(sel)?.dataset.state;

beforeEach(() => {
	localStorage.clear();
	document.body.replaceChildren();
});

describe('mountCompetencyMap', () => {
	it('does nothing on a page without the map', () => {
		expect(mountCompetencyMap()).toBe(false);
	});

	it('colors competencies and objectives from the record and redraws on a progress write', () => {
		render();
		expect(mountCompetencyMap()).toBe(true);
		expect(state('[data-competency="a/c"]')).toBe('untouched');
		progress.finishLesson('a/one', []);
		expect(state('[data-objective="a/c/x"]')).toBe('finished');
		expect(state('[data-objective="a/c/y"]')).toBe('untouched');
		expect(state('[data-competency="a/c"]')).toBe('in-progress');
		progress.finishLesson('a/two', []);
		expect(state('[data-competency="a/c"]')).toBe('finished');
		// A box the coverage doesn't name keeps its server-rendered state.
		expect(state('[data-competency="a/unknown"]')).toBe('untouched');
	});
});
