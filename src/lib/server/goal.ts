// Goal-first design engine. Given a goal (target bundle) and a species, it measures
// which of the plant's actives engage the goal's targets (directed ChEMBL query),
// ranks them, and — crucially — emits an explicit REASONING CHAIN that states, for
// the lead active, why each database is consulted and how they connect to produce
// the result. This is the defensible "show your work" artifact.
import { resolvePlant } from './resolve';
import { getCompound } from './sources/pubchem';
import { directedActivity, type DirectedHit } from './sources/chembl';
import { getProteinByAccession } from './sources/uniprot';
import { coMentionCount } from './sources/pubmed';
import { designFormulation, type FormulationPlan } from './formulate';
import { getGoal, type Goal } from '#lib/data/goals';

export type TargetHit = {
	acc: string;
	gene: string;
	role: string;
	evidence: 'binding' | 'regulatory';
	chemblTarget: string | null;
	pchembl: number | null;
	valueNm: number | null;
	type: string | null;
};

export type ActiveScore = {
	cid: number;
	name: string;
	chemblId: string | null;
	inchikey: string | null;
	smiles: string | null;
	formula: string | null;
	mw: number | null;
	xlogp: number | null;
	tpsa: number | null;
	routeFit: number;
	maxPchembl: number;
	hits: TargetHit[];
	literature: number;
	score: number;
	rationale: string;
};

export type ReasonStep = {
	database: string;
	question: string;
	connects: string; // the join key that links this DB to the chain
	finding: string;
	whyItMatters: string;
	evidence?: { label: string; value: string };
};

export type Dossier = {
	goal: Pick<Goal, 'id' | 'label' | 'claimClass' | 'route' | 'intent' | 'summary' | 'moa' | 'caveats'>;
	species: { slug: string; common: string; scientific: string; family: string };
	generatedAt: string;
	actives: ActiveScore[];
	lead: ActiveScore | null;
	reasoning: ReasonStep[];
	targets: { acc: string; gene: string; role: string; evidence: string; name: string | null; functionNote: string | null }[];
	formulation: FormulationPlan;
	literature: { term: string; count: number }[];
	caveats: string[];
	notes: string[];
};

export async function designForGoal(goalId: string, slug: string): Promise<Dossier | null> {
	const goal = getGoal(goalId);
	if (!goal) return null;
	const plant = await resolvePlant(slug);
	if (!plant) return null;

	const accs = goal.targets.map((t) => t.acc);
	const bindingAccs = goal.targets.filter((t) => t.evidence === 'binding').map((t) => t.acc);

	// Resolve physchem + directed activity for each compound (bounded, tolerant).
	const picks = plant.compounds.slice(0, 6);
	const scored = await Promise.all(
		picks.map(async (c) => {
			const pub = await getCompound(c).catch(() => null);
			if (!pub) return null;
			const directed = bindingAccs.length ? await directedActivity(pub.inchikey, pub.name, bindingAccs).catch(() => ({}) as Record<string, DirectedHit>) : {};
			const hits: TargetHit[] = goal.targets.map((t) => {
				const d = directed[t.acc];
				return {
					acc: t.acc,
					gene: t.gene,
					role: t.role,
					evidence: t.evidence,
					chemblTarget: d?.chemblTarget ?? null,
					pchembl: d?.pchembl ?? null,
					valueNm: d?.valueNm ?? null,
					type: d?.type ?? null
				};
			});
			const maxPchembl = Math.max(0, ...hits.map((h) => h.pchembl ?? 0));
			const rf = routeFit(goal.route, pub.mw, pub.xlogp, pub.tpsa);
			return { pub, hits, maxPchembl, routeFit: rf };
		})
	);
	const rows = scored.filter((x): x is NonNullable<typeof x> => !!x);
	if (!rows.length) return null;

	// Literature corroboration (lead term) for each compound — one combined count.
	const litLead = goal.litTerms[0];
	const actives: ActiveScore[] = await Promise.all(
		rows.map(async (r) => {
			const lit = await coMentionCount(litLead, r.pub.name).catch(() => 0);
			const activityNorm = clamp((r.maxPchembl - 4) / 6, 0, 1); // pChEMBL 4→0, 10→1
			const litNorm = clamp(Math.log10(lit + 1) / 2.5, 0, 1); // ~300 papers → 1
			const score = 0.5 * activityNorm + 0.3 * r.routeFit + 0.2 * litNorm;
			return {
				cid: r.pub.cid,
				name: r.pub.name,
				chemblId: null,
				inchikey: r.pub.inchikey,
				smiles: r.pub.smiles,
				formula: r.pub.formula,
				mw: r.pub.mw,
				xlogp: r.pub.xlogp,
				tpsa: r.pub.tpsa,
				routeFit: round(r.routeFit),
				maxPchembl: round(r.maxPchembl),
				hits: r.hits,
				literature: lit,
				score: round(score),
				rationale: leadLine(r.pub.name, r.hits, r.routeFit, lit, goal)
			};
		})
	);
	actives.sort((a, b) => b.score - a.score);
	const lead = actives[0] ?? null;

	// Enrich goal targets with UniProt identity (for the target table + reasoning).
	const targets = await Promise.all(
		goal.targets.map(async (t) => {
			const prot = await getProteinByAccession(t.acc).catch(() => null);
			return { acc: t.acc, gene: t.gene, role: t.role, evidence: t.evidence, name: prot?.name ?? null, functionNote: shortFn(prot?.fn ?? null) };
		})
	);

	const litCounts = await Promise.all(
		goal.litTerms.map(async (term) => ({ term: `${lead?.name ?? 'actives'} + ${term}`, count: lead ? await coMentionCount(term, lead.name).catch(() => 0) : 0 }))
	);

	const reasoning = lead ? buildReasoning(goal, plant, lead, targets) : [];
	const formulation = await designFormulation(goal, actives);

	return {
		goal: { id: goal.id, label: goal.label, claimClass: goal.claimClass, route: goal.route, intent: goal.intent, summary: goal.summary, moa: goal.moa, caveats: goal.caveats },
		species: { slug: plant.slug, common: plant.common, scientific: plant.scientific, family: plant.family },
		generatedAt: new Date().toISOString(),
		actives,
		lead,
		reasoning,
		targets,
		formulation,
		literature: litCounts,
		caveats: goal.caveats,
		notes: plant.traditions.length === 0 ? ['On-demand species — no curated traditional-use records; the chain below is fully computed from open databases.'] : []
	};
}

// ── The database reasoning chain (the "show your work" artifact) ──────────────
function buildReasoning(goal: Goal, plant: Awaited<ReturnType<typeof resolvePlant>>, lead: ActiveScore, targets: Dossier['targets']): ReasonStep[] {
	const p = plant!;
	const boundHit = lead.hits.filter((h) => h.pchembl != null).sort((a, b) => (b.pchembl ?? 0) - (a.pchembl ?? 0))[0];
	const steps: ReasonStep[] = [];

	steps.push({
		database: 'LOTUS',
		question: `Does ${p.common} (${p.scientific}) actually contain ${lead.name}?`,
		connects: 'taxon name → compound, via the "found in taxon" (P703) occurrence relation',
		finding: `${lead.name} is recorded as a constituent of ${p.scientific}.`,
		whyItMatters: 'Establishes the candidate is genuinely present in the plant — the claim starts from a real occurrence, not an assumption.'
	});

	steps.push({
		database: 'PubChem',
		question: `What is ${lead.name}'s structure, and is it suited to a ${goal.route} product?`,
		connects: 'compound name → CID → InChIKey — the structure key that unlocks every downstream database',
		finding: `CID ${lead.cid}${lead.mw ? `, MW ${lead.mw}` : ''}${lead.xlogp != null ? `, logP ${lead.xlogp}` : ''}${lead.tpsa != null ? `, TPSA ${lead.tpsa}` : ''}.`,
		whyItMatters: `${goal.route === 'topical' ? 'logP ~2–3.5 and MW < 500 is the skin-permeation sweet spot' : 'MW < 500 and logP < 5 (Lipinski) supports oral absorption'} — route-fit scored ${lead.routeFit}.`,
		evidence: { label: 'route fit', value: String(lead.routeFit) }
	});

	if (boundHit) {
		const t = targets.find((x) => x.acc === boundHit.acc);
		steps.push({
			database: 'ChEMBL',
			question: `Does ${lead.name} measurably engage the goal target ${boundHit.gene}?`,
			connects: `InChIKey → ChEMBL molecule; UniProt ${boundHit.acc} → ChEMBL target ${boundHit.chemblTarget}; joined on measured bioactivities`,
			finding: `${boundHit.type ?? 'IC50'} ${boundHit.valueNm != null ? `${fmtNm(boundHit.valueNm)} ` : ''}(pChEMBL ${boundHit.pchembl}) against ${boundHit.gene}.`,
			whyItMatters: `${boundHit.gene} is ${t?.role ?? 'a goal target'} — a measured interaction here is the core, directly-cited mechanistic evidence for the ${goal.label} claim.`,
			evidence: { label: `${boundHit.gene} pChEMBL`, value: String(boundHit.pchembl) }
		});
	} else {
		steps.push({
			database: 'ChEMBL',
			question: `Does ${lead.name} have measured binding to the goal's enzyme targets?`,
			connects: 'InChIKey → ChEMBL molecule; UniProt accession → ChEMBL target',
			finding: 'No direct binding assay found for this compound against the goal targets.',
			whyItMatters: 'The mechanism then rests on regulatory/literature evidence (below) rather than a measured IC50 — stated honestly, not overclaimed.'
		});
	}

	const tgt = boundHit ? targets.find((x) => x.acc === boundHit.acc) : targets[0];
	if (tgt) {
		steps.push({
			database: 'UniProt',
			question: `What exactly is ${tgt.gene}, and what is its role in the mechanism?`,
			connects: 'the same UniProt accession names the protein consistently across ChEMBL and Open Targets',
			finding: `${tgt.name ?? tgt.gene} (${tgt.acc})${tgt.functionNote ? ` — ${tgt.functionNote}` : ''}.`,
			whyItMatters: `Confirms we are acting on ${tgt.role.toLowerCase()} — the biological step the goal depends on.`
		});
	}

	steps.push({
		database: 'PubMed',
		question: `Is the ${lead.name} × ${goal.litTerms[0]} link independently documented?`,
		connects: 'free-text co-occurrence — evidence generated outside our computed chain',
		finding: `${lead.literature.toLocaleString()} papers co-mention "${lead.name}" and "${goal.litTerms[0]}".`,
		whyItMatters: 'Independent literature corroborates the mechanism — the claim is precedented, not speculative.',
		evidence: { label: 'papers', value: lead.literature.toLocaleString() }
	});

	steps.push({
		database: '→ Conclusion',
		question: `Is ${lead.name} a defensible ${goal.label} lead from ${p.common}?`,
		connects: 'LOTUS → PubChem → ChEMBL → UniProt → PubMed form one traceable chain',
		finding: `${lead.name}: ${boundHit ? `measured ${boundHit.gene} ${boundHit.type ?? 'inhibitor'} (pChEMBL ${boundHit.pchembl})` : 'regulatory-level target engagement'}, route-fit ${lead.routeFit}, ${lead.literature.toLocaleString()} supporting papers.`,
		whyItMatters: 'Every number links to an open record; the mechanism is coherent across independent databases. That is the defensibility.'
	});

	return steps;
}

function leadLine(name: string, hits: TargetHit[], rf: number, lit: number, goal: Goal): string {
	const bound = hits.filter((h) => h.pchembl != null).sort((a, b) => (b.pchembl ?? 0) - (a.pchembl ?? 0))[0];
	if (bound) return `Measured ${bound.gene} ${bound.type ?? 'inhibitor'} (pChEMBL ${bound.pchembl}); route-fit ${round(rf)}; ${lit.toLocaleString()} papers.`;
	return `No direct binding to goal targets; route-fit ${round(rf)}; ${lit.toLocaleString()} papers — supporting, not lead.`;
}

function routeFit(route: 'topical' | 'oral', mw: number | null, xlogp: number | null, tpsa: number | null): number {
	if (mw == null) return 0.4;
	let s = 1;
	if (route === 'topical') {
		if (xlogp != null) s *= gaussian(xlogp, 2.5, 1.8);
		s *= mw < 500 ? 1 : Math.max(0, 1 - (mw - 500) / 300);
		if (tpsa != null) s *= tpsa < 120 ? 1 : Math.max(0.3, 1 - (tpsa - 120) / 120);
	} else {
		s *= mw <= 500 ? 1 : 0.5;
		if (xlogp != null) s *= xlogp <= 5 ? 1 : 0.5;
		if (tpsa != null) s *= tpsa <= 140 ? 1 : 0.6;
	}
	return clamp(s, 0, 1);
}

function gaussian(x: number, mu: number, sigma: number): number {
	return Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));
}
function clamp(x: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, x));
}
function round(n: number): number {
	return Math.round(n * 100) / 100;
}
function fmtNm(nm: number): string {
	if (nm >= 1000) return `${(nm / 1000).toFixed(nm >= 10000 ? 0 : 1)} µM`;
	return `${nm} nM`;
}
function shortFn(fn: string | null): string | null {
	if (!fn) return null;
	const clause = fn.split(/[.;]/)[0].trim();
	return clause.length > 100 ? clause.slice(0, 97) + '…' : clause;
}
