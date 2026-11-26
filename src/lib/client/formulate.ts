// Formulation engine (Phase 2).
// Diagnoses an API's developability deficiencies, matches functional excipients
// to each, and scores the resulting formulation against the plain active.
// Outputs are model estimates for prioritisation — not efficacy claims.

import type { Descriptors } from './chem';
import type { Developability } from './admet';
import { EXCIPIENTS, type Deficiency, type Excipient, DEFICIENCY_LABEL } from '#lib/data/excipients';

export type Diagnosis = { deficiency: Deficiency; severity: number; reason: string; label: string };

export function diagnose(desc: Descriptors, dev: Developability): Diagnosis[] {
	const out: Diagnosis[] = [];
	// NaN-safe: a non-finite input (e.g. a bad descriptor) falls back to `lo`
	// rather than poisoning the severity (and everything downstream).
	const clamp = (v: number, lo = 0.3, hi = 1) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo);

	// Solubility — driven by ESOL logS and BCS.
	if (dev.logS < -3.5 || dev.bcs.class === 'II' || dev.bcs.class === 'IV') {
		out.push({
			deficiency: 'solubility',
			severity: clamp((-3.5 - dev.logS) / 3),
			reason: `logS ${dev.logS} (${dev.solLabel}); BCS ${dev.bcs.class}.`,
			label: DEFICIENCY_LABEL.solubility
		});
	}
	// Permeability — Egan / BCS permeability flag.
	if (!dev.bcs.permeable) {
		out.push({
			deficiency: 'permeability',
			severity: clamp((desc.psa - 90) / 80 + 0.4),
			reason: `TPSA ${desc.psa.toFixed(0)} Å² limits passive permeation (GI absorption ${dev.gi}).`,
			label: DEFICIENCY_LABEL.permeability
		});
	}
	// First-pass metabolism — phenolic actives are glucuronidation-prone.
	if (desc.hbd >= 2 && desc.aromaticProportion > 0.2) {
		out.push({
			deficiency: 'metabolism',
			severity: clamp(0.4 + desc.hbd * 0.1, 0.4, 0.8),
			reason: `${desc.hbd} H-bond donors on an aromatic scaffold — prone to intestinal glucuronidation.`,
			label: DEFICIENCY_LABEL.metabolism
		});
	}
	// Chemical stability — reactive/labile groups flagged by structural alerts.
	if (desc.alerts >= 2) {
		out.push({
			deficiency: 'stability',
			severity: clamp(0.3 + desc.alerts * 0.08, 0.3, 0.7),
			reason: `${desc.alerts} structural alerts — reactive groups liable to oxidative/chemical degradation.`,
			label: DEFICIENCY_LABEL.stability
		});
	}
	return out;
}

export type Recommendation = { deficiency: Diagnosis; options: Excipient[] };

export function recommend(diagnoses: Diagnosis[]): Recommendation[] {
	return diagnoses.map((dg) => ({
		deficiency: dg,
		options: EXCIPIENTS.filter((e) => e.addresses.includes(dg.deficiency)).sort((a, b) => b.potency - a.potency)
	}));
}

export type PerDeficiency = {
	deficiency: Deficiency;
	label: string;
	severity: number;
	covered: boolean;
	by: string[];
};

export type Score = {
	coverage: number; // 0..1 of deficiencies addressed
	relExposure: number; // × vs plain API (model estimate, capped)
	perDeficiency: PerDeficiency[];
	extras: Excipient[]; // selected but not addressing a diagnosed deficiency
	baselineNote: string;
};

export function scoreFormulation(diagnoses: Diagnosis[], selectedIds: string[]): Score {
	const selected = EXCIPIENTS.filter((e) => selectedIds.includes(e.id));
	const perDeficiency: PerDeficiency[] = diagnoses.map((dg) => {
		const by = selected.filter((e) => e.addresses.includes(dg.deficiency));
		return {
			deficiency: dg.deficiency,
			label: dg.label,
			severity: dg.severity,
			covered: by.length > 0,
			by: by.map((e) => e.name)
		};
	});

	// relative exposure: multiply a bounded uplift for each addressed deficiency
	let rel = 1;
	for (const dg of diagnoses) {
		const best = Math.max(
			0,
			...selected.filter((e) => e.addresses.includes(dg.deficiency)).map((e) => e.potency)
		);
		if (best > 0) rel *= 1 + best * dg.severity * 3;
	}
	rel = Math.min(30, Math.round(rel * 10) / 10);

	const covered = perDeficiency.filter((p) => p.covered).length;
	const coverage = diagnoses.length ? covered / diagnoses.length : 1;

	const addressedDeficiencies = new Set(diagnoses.map((d) => d.deficiency));
	const extras = selected.filter((e) => !e.addresses.some((a) => addressedDeficiencies.has(a)));

	const baselineNote = diagnoses.length
		? `Plain active is limited by: ${diagnoses.map((d) => d.label.toLowerCase()).join(', ')}.`
		: 'This active is already well-behaved (BCS I) — formulation offers limited upside.';

	return { coverage, relExposure: rel, perDeficiency, extras, baselineNote };
}
