// Formulation engine (Phase 4), server side. Diagnoses the lead active's
// developability deficiencies from PubChem physicochemistry, matches route-
// appropriate functional excipients, grounds each in LIVE regulatory precedent
// (openFDA) and literature (PubMed), scores a route-aware exposure uplift, and
// computes multi-active complementarity across the goal's targets.
import { EXCIPIENTS, FDA_TERMS, EVIDENCE_TERMS, type Excipient } from '#lib/data/excipients';
import { ingredientUsage } from './sources/openfda';
import { coMentionCount } from './sources/pubmed';
import { predictSolubility, type Prediction } from './predict';
import type { Goal } from '#lib/data/goals';

export type DiagKind = 'solubility' | 'permeability' | 'metabolism' | 'stability' | 'photostability';
export type Deficiency = { kind: DiagKind; label: string; severity: number; reason: string };

export type ExcipientPick = {
	id: string;
	name: string;
	class: string;
	mechanism: string;
	addresses: DiagKind[];
	potency: number;
	regulatory: string;
	precedent: string | null;
	precedentCaveat: string | null; // e.g. an oral PK precedent shown on a topical route
	fdaLabelMentions: number | null; // live openFDA label mentions (NOT IID potency limits)
	evidence: number | null; // live PubMed co-mention (active + excipient)
};

export type Complementarity = {
	score: number; // distinct goal targets covered / total goal targets
	distinctTargets: number;
	totalTargets: number;
	actives: { name: string; covers: string[] }[];
	note: string;
};

export type FormulationPlan = {
	route: 'topical' | 'oral';
	lead: string | null;
	deficiencies: Deficiency[];
	excipients: ExcipientPick[];
	coverage: number; // fraction of deficiencies addressed
	exposureIndex: number; // relative uplift vs raw active — HEURISTIC estimate, directional
	exposureBasis: string;
	priorityBand: 'low' | 'moderate' | 'high'; // qualitative — the honest headline
	method: string; // how exposureIndex was produced (heuristic vs learned model)
	admetMethod: 'model' | 'heuristic' | 'none'; // how the solubility input was produced
	complementarity: Complementarity;
	rationale: string;
};

type ActiveLike = {
	name: string;
	smiles: string | null;
	mw: number | null;
	xlogp: number | null;
	tpsa: number | null;
	formula: string | null;
	hits: { gene: string; pchembl: number | null }[];
};

const DEFICIENCY_LABEL: Record<DiagKind, string> = {
	solubility: 'Low aqueous solubility',
	permeability: 'Low permeability',
	metabolism: 'First-pass metabolism',
	stability: 'Chemical instability',
	photostability: 'Photo-instability'
};

// Excipients that make sense for a topical (skin) product — the KB is otherwise
// oral-oriented. Oral uses the whole library.
const TOPICAL_OK = new Set(['liposome', 'phospholipid', 'hpbcd', 'tocopherol', 'ph-buffer']);

export async function designFormulation(goal: Goal, actives: ActiveLike[]): Promise<FormulationPlan> {
	const route = goal.route;
	const lead = actives[0] ?? null;

	// Solubility goes through the ML-ready boundary (trained model when configured,
	// transparent heuristic otherwise — the result is labeled either way).
	const sol = lead ? await predictSolubility(lead.smiles, lead.xlogp, lead.mw) : null;
	const deficiencies = lead ? diagnose(route, lead, sol) : [];

	// Match excipients: for each deficiency, the route-appropriate options that
	// address it, best potency first; keep the top two per deficiency.
	const chosen = new Map<string, Excipient>();
	for (const d of deficiencies) {
		const addr = excipientDeficiency(d.kind);
		const opts = EXCIPIENTS.filter((e) => e.addresses.includes(addr) && (route === 'oral' || TOPICAL_OK.has(e.id))).sort((a, b) => b.potency - a.potency);
		for (const e of opts.slice(0, 2)) chosen.set(e.id, e);
	}

	// Enrich the chosen excipients with LIVE precedent (bounded, cached, tolerant).
	const picks: ExcipientPick[] = await Promise.all(
		[...chosen.values()]
			.sort((a, b) => b.potency - a.potency)
			.map(async (e) => {
				const fdaTerm = FDA_TERMS[e.id];
				const evTerm = EVIDENCE_TERMS[e.id];
				const [fdaLabelMentions, evidence] = await Promise.all([
					fdaTerm ? ingredientUsage(fdaTerm).catch(() => null) : Promise.resolve(null),
					lead && evTerm ? coMentionCount(lead.name, evTerm).catch(() => null) : Promise.resolve(null)
				]);
				// An oral PK fold-change precedent (e.g. "Meriva ~29× bioavailability")
				// must NOT be read as a topical claim — flag it when routes differ.
				const precedent = e.precedent ?? null;
				const oralClaim = precedent ? /bioavailab|×|fold|AUC/i.test(precedent) : false;
				const precedentCaveat = precedent && oralClaim && route === 'topical' ? 'Oral PK precedent — not transferable to a topical (skin) product.' : null;
				return {
					id: e.id,
					name: e.name,
					class: e.class,
					mechanism: e.mechanism,
					addresses: e.addresses as DiagKind[],
					potency: e.potency,
					regulatory: e.regulatory,
					precedent,
					precedentCaveat,
					fdaLabelMentions,
					evidence
				};
			})
	);

	// Coverage + route-aware exposure uplift (multiplicative, bounded).
	const K = route === 'topical' ? 2.4 : 3;
	let rel = 1;
	let covered = 0;
	for (const d of deficiencies) {
		const addr = excipientDeficiency(d.kind);
		const best = Math.max(0, ...picks.filter((p) => p.addresses.includes(addr)).map((p) => p.potency));
		if (best > 0) {
			rel *= 1 + best * d.severity * K;
			covered++;
		}
	}
	const exposureIndex = Math.min(30, Math.round(rel * 10) / 10);
	const coverage = deficiencies.length ? covered / deficiencies.length : 1;

	const complementarity = complement(goal, actives);
	const exposureBasis = route === 'topical' ? 'epidermal deposition × photostability (not oral AUC)' : 'oral AUC (absorption × reduced first-pass)';
	const priorityBand: FormulationPlan['priorityBand'] = exposureIndex >= 5 ? 'high' : exposureIndex >= 2 ? 'moderate' : 'low';

	return {
		route,
		lead: lead?.name ?? null,
		deficiencies,
		excipients: picks,
		coverage: round(coverage),
		exposureIndex,
		exposureBasis,
		priorityBand,
		method: 'Heuristic (potency × severity model) — directional priority only, not a measured or learned fold-change. A learned route-specific PK/skin-permeation model replaces this when ADMET_SERVICE_URL is configured.',
		admetMethod: sol?.method ?? 'none',
		complementarity,
		rationale: rationale(route, lead?.name ?? 'the lead active', picks, exposureIndex, complementarity)
	};
}

function diagnose(route: 'topical' | 'oral', a: ActiveLike, sol: Prediction | null): Deficiency[] {
	const out: Deficiency[] = [];
	const clamp = (v: number, lo = 0.3, hi = 1) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo);
	const o = oxygens(a.formula);
	const polyphenol = o >= 4; // oxygen-rich → likely polyphenolic / oxidation-prone

	// Solubility — from the prediction boundary (model or heuristic, labeled).
	const logS = sol?.value ?? null;
	if (logS != null && logS < -3.5) {
		const tag = sol?.method === 'model' ? `model logS ${logS}${sol.uncertainty != null ? ` ±${sol.uncertainty}` : ''}` : `heuristic logS ${logS.toFixed(1)} (reduced ESOL)`;
		const dom = sol?.inDomain === false ? ' — out of applicability domain, indicative only' : '';
		out.push({ kind: 'solubility', label: DEFICIENCY_LABEL.solubility, severity: clamp((-3.5 - logS) / 3), reason: `${tag}${dom}.` });
	}

	if (route === 'oral') {
		// Permeability — high polar surface area limits passive permeation.
		if (a.tpsa != null && a.tpsa > 130) out.push({ kind: 'permeability', label: DEFICIENCY_LABEL.permeability, severity: clamp((a.tpsa - 130) / 80 + 0.3, 0.3, 0.9), reason: `TPSA ${a.tpsa.toFixed(0)} Å² limits passive GI permeation.` });
		// First-pass metabolism — oxygen-rich aromatic actives are glucuronidation-prone.
		if (polyphenol) out.push({ kind: 'metabolism', label: DEFICIENCY_LABEL.metabolism, severity: 0.6, reason: `Oxygen-rich (${o} O) phenolic scaffold — prone to intestinal glucuronidation/first-pass loss.` });
	} else {
		// Topical — photostability is the critical concern for conjugated polyphenols.
		if (polyphenol) out.push({ kind: 'photostability', label: DEFICIENCY_LABEL.photostability, severity: 0.7, reason: `Conjugated, oxygen-rich (${o} O) chromophore — degrades under light/UV, the exact exposure a topical faces.` });
	}

	// Chemical stability — polyphenols oxidise; flag for both routes.
	if (polyphenol) out.push({ kind: 'stability', label: DEFICIENCY_LABEL.stability, severity: 0.5, reason: `Polyphenolic active liable to oxidative degradation; needs an antioxidant / pH-controlled vehicle.` });

	return out;
}

function complement(goal: Goal, actives: ActiveLike[]): Complementarity {
	const total = goal.targets.length;
	const withHits = actives.filter((a) => a.hits.some((h) => h.pchembl != null)).slice(0, 4);
	const perActive = withHits.map((a) => ({ name: a.name, covers: a.hits.filter((h) => h.pchembl != null).map((h) => h.gene) }));
	const distinctSet = new Set<string>();
	for (const a of perActive) for (const g of a.covers) distinctSet.add(g);
	const distinct = distinctSet.size;
	const score = total ? round(distinct / total) : 0;
	const note =
		perActive.length <= 1
			? `A single measured active engages ${distinct}/${total} goal targets — limited polypharmacology from binding data alone.`
			: `${perActive.length} actives jointly engage ${distinct}/${total} goal targets — the multi-active complementarity that a single-molecule drug lacks.`;
	return { score, distinctTargets: distinct, totalTargets: total, actives: perActive, note };
}

function rationale(route: 'topical' | 'oral', lead: string, picks: ExcipientPick[], idx: number, comp: Complementarity): string {
	const top = picks[0]?.name ?? 'a functional carrier';
	if (route === 'topical') {
		return `${lead} is delivered via ${top.toLowerCase()} so it survives light and reaches the epidermis; with the antioxidant/pH system the directional (heuristic) priority is ~${idx}× over the raw extract on a skin-deposition + photostability basis — not a measured fold-change. ${comp.note}`;
	}
	return `${lead} is paired with ${top.toLowerCase()} to raise absorption and blunt first-pass loss — a directional (heuristic) priority of ~${idx}× oral AUC over the raw extract, not a measured value. ${comp.note}`;
}

function excipientDeficiency(k: DiagKind): 'solubility' | 'permeability' | 'metabolism' | 'stability' {
	return k === 'photostability' ? 'stability' : k;
}
function oxygens(formula: string | null): number {
	if (!formula) return 0;
	const m = formula.match(/O(\d*)/);
	return m ? (m[1] ? parseInt(m[1], 10) : 1) : 0;
}
function round(n: number): number {
	return Math.round(n * 100) / 100;
}
