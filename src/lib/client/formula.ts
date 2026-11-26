// Multi-active formula logic (Phase 2, deepened).
// Combines several actives into one formula and measures how complementary
// their target coverage is — the network-pharmacology basis of synergy.
import type { Diagnosis } from './formulate';

export type ActiveTarget = { gene: string; accession: string; score: number; prefName: string };
export type FormulaActive = {
	id: string;
	name: string;
	common: string;
	slug: string;
	cid: number;
	smiles: string | null;
	inchikey: string | null;
	targets: ActiveTarget[];
};

export type CombinedTarget = {
	accession: string;
	gene: string;
	prefName: string;
	score: number;
	by: string[]; // active names hitting it
	shared: boolean;
};

export function combineTargets(actives: FormulaActive[]): CombinedTarget[] {
	const map = new Map<string, CombinedTarget>();
	for (const a of actives) {
		for (const t of a.targets) {
			const ex = map.get(t.accession);
			if (ex) {
				if (!ex.by.includes(a.name)) ex.by.push(a.name);
				ex.score = Math.max(ex.score, t.score);
			} else {
				map.set(t.accession, {
					accession: t.accession,
					gene: t.gene,
					prefName: t.prefName,
					score: t.score,
					by: [a.name],
					shared: false
				});
			}
		}
	}
	const out = [...map.values()].map((t) => ({ ...t, shared: t.by.length > 1 }));
	return out.sort((a, b) => b.by.length - a.by.length || b.score - a.score);
}

export type Complementarity = {
	targets: number; // distinct targets
	shared: number; // hit by ≥2 actives
	hits: number; // total (active,target) pairs
	score: number; // distinct / hits  (1 = fully complementary, →0.5 = redundant)
};

export function complementarity(actives: FormulaActive[]): Complementarity {
	const combined = combineTargets(actives);
	const hits = actives.reduce((n, a) => n + a.targets.length, 0);
	const targets = combined.length;
	const shared = combined.filter((t) => t.shared).length;
	return { targets, shared, hits, score: hits ? targets / hits : 1 };
}

// Merge per-active deficiency diagnoses into the formula's combined profile.
export function mergeDiagnoses(perActive: { name: string; diagnoses: Diagnosis[] }[]): (Diagnosis & {
	actives: string[];
})[] {
	const map = new Map<string, Diagnosis & { actives: string[] }>();
	for (const pa of perActive) {
		for (const d of pa.diagnoses) {
			const ex = map.get(d.deficiency);
			if (ex) {
				if (Number.isFinite(d.severity)) ex.severity = Math.max(ex.severity, d.severity);
				if (!ex.actives.includes(pa.name)) ex.actives.push(pa.name);
			} else {
				map.set(d.deficiency, { ...d, actives: [pa.name] });
			}
		}
	}
	return [...map.values()].sort((a, b) => b.severity - a.severity);
}

export function uniqueGenes(actives: FormulaActive[]): string[] {
	return [...new Set(actives.flatMap((a) => a.targets.map((t) => t.gene)))];
}
