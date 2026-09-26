/**
 * The competency map in the browser: each competency box and each objective
 * line colored by the state of the live lessons that serve it, redrawn on
 * every progress write. The rules are in `competency-map-model.ts`.
 */
import { type CompetencyCoverage, competencyMapStates } from './competency-map-model';
import * as progress from './progress';
import { requiredData } from './required-element';

function bindCompetencyMap(root: HTMLElement) {
	const coverage: CompetencyCoverage[] = JSON.parse(requiredData(root, 'coverage'));

	function draw() {
		const { competencies, objectives } = competencyMapStates(coverage, progress.load());
		for (const el of root.querySelectorAll<HTMLElement>('[data-competency]')) {
			const state = competencies.get(el.dataset.competency ?? '');
			if (state) el.dataset.state = state;
		}
		for (const el of root.querySelectorAll<HTMLElement>('[data-objective]')) {
			const state = objectives.get(el.dataset.objective ?? '');
			if (state) el.dataset.state = state;
		}
	}

	draw();
	document.addEventListener(progress.EVENT, draw);
}

/** Binds the competency map under `doc`; returns false when the page has no map. */
export function mountCompetencyMap(doc: ParentNode = document): boolean {
	const root = doc.querySelector<HTMLElement>('[data-competency-map]');
	if (!root) return false;
	bindCompetencyMap(root);
	return true;
}
