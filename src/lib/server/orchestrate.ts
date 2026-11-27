// Assembles a "plant → compounds → targets → diseases" profile by fanning out
// across the open databases. Split into a FAST base (plant identity, traditions,
// PubChem compounds, literature) and a SLOW, time-budgeted targets layer
// (ChEMBL → UniProt → Open Targets). The explore page loads them progressively
// so the page renders in seconds even when ChEMBL/EBI is slow, and the targets
// section streams in (returning partial results rather than ever timing out).
import { getPlant, type Plant } from '#lib/data/plants';
import { resolvePlant } from './resolve';
import { cached } from './cache';
import { getCompound, type PubChemCompound } from './sources/pubchem';
import { getTargets, type ChemblTarget } from './sources/chembl';
import { getProteinByAccession } from './sources/uniprot';
import { getDiseases, type DiseaseLink } from './sources/opentargets';
import { litCount, coMentionCount } from './sources/pubmed';

export type CompoundTargetRef = { accession: string; score: number; evidence: string; mechanism?: string };

export type CompoundOut = PubChemCompound & {
	chemblId: string | null;
	literature: number; // co-mentions with the plant
	targets: CompoundTargetRef[];
};

export type TargetOut = {
	accession: string;
	prefName: string; // friendly name, e.g. "Cyclooxygenase-2"
	gene: string | null;
	proteinName: string;
	ensembl: string | null;
	category: string | null; // short function snippet
	score: number; // max confidence across compounds
	diseases: DiseaseLink[];
};

export type Edge = { compound: string; target: string; score: number; evidence: string };

type PlantMeta = Pick<Plant, 'slug' | 'common' | 'scientific' | 'family' | 'blurb' | 'taxon' | 'traditions'>;

export type PlantBase = {
	plant: PlantMeta;
	compounds: CompoundOut[];
	literature: { count: number; url: string };
	sources: string[];
	generatedAt: string;
};

export type PlantTargets = {
	targets: TargetOut[];
	edges: Edge[];
	compoundTargets: Record<number, CompoundTargetRef[]>; // keyed by compound CID
	compoundChembl: Record<number, string | null>;
	partial: boolean; // true when the time budget cut the fan-out short
};

export type PlantProfile = PlantBase & {
	targets: TargetOut[];
	edges: Edge[];
};

// The platform's dataset roster. LOTUS is only listed when a species was actually
// resolved live from LOTUS — a curated catalogue plant (e.g. turmeric) never ran a
// LOTUS SPARQL query, so claiming it as a source would be false provenance.
const DATASETS = ['PubChem', 'ChEMBL', 'UniProt', 'Open Targets', 'AlphaFold', 'PubMed'];
function sourcesFor(slug: string): string[] {
	return getPlant(slug) ? DATASETS : ['LOTUS', ...DATASETS];
}

// How long the targets fan-out may run before it returns whatever has resolved.
// Kept safely under Vercel's 60s function cap.
const TARGETS_BUDGET_MS = 50_000;

function meta(plant: Plant): PlantMeta {
	return {
		slug: plant.slug,
		common: plant.common,
		scientific: plant.scientific,
		family: plant.family,
		blurb: plant.blurb,
		taxon: plant.taxon,
		traditions: plant.traditions
	};
}

// ── FAST base: plant identity + PubChem compounds + literature. ───────────────
export function getPlantBase(slug: string): Promise<PlantBase | null> {
	return cached(`base:${slug}`, 6 * 3600_000, async () => {
		const plant = await resolvePlant(slug);
		if (!plant) return null;

		// Natural occurrences only — semi-synthetic derivatives (e.g. artesunate) are
		// excluded so they are never treated as plant constituents.
		const picks = plant.compounds.filter((c) => !c.derivative).slice(0, 6);
		const settled = await Promise.allSettled(picks.map((c) => getCompound(c)));
		const resolved = settled
			.map((s) => (s.status === 'fulfilled' && s.value ? s.value : null))
			.filter((x): x is PubChemCompound => !!x);
		// If NOTHING resolved, PubChem is busy — throw so this empty result is never
		// cached (it self-heals on the next request).
		if (resolved.length === 0) throw new Error(`compound resolution failed for ${slug} (upstream busy)`);

		const [coLit, lit] = await Promise.all([
			Promise.allSettled(resolved.map((x) => coMentionCount(plant.scientific, x.name))),
			litCount(plant.scientific).catch(() => ({ count: 0, url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(plant.scientific)}` }))
		]);

		const compounds: CompoundOut[] = resolved.map((pub, i) => ({
			...pub,
			chemblId: null, // resolved later by the targets layer
			literature: coLit[i].status === 'fulfilled' ? (coLit[i] as PromiseFulfilledResult<number>).value : 0,
			targets: []
		}));

		return {
			plant: meta(plant),
			compounds,
			literature: { count: lit.count, url: lit.url },
			sources: sourcesFor(slug),
			generatedAt: new Date().toISOString()
		};
	});
}

// ── SLOW targets: ChEMBL → UniProt → Open Targets, time-budgeted & partial-safe.
export function getPlantTargets(slug: string): Promise<PlantTargets | null> {
	return cached(`targets:${slug}`, 6 * 3600_000, async () => {
		const plant = await resolvePlant(slug);
		if (!plant) return null;
		const base = await getPlantBase(slug);
		if (!base || base.compounds.length === 0) throw new Error(`no compounds for ${slug}`);

		// Accumulators the deadline snapshot reads from — built incrementally so a
		// timeout still returns everything resolved so far.
		const edges: Edge[] = [];
		const targetMap = new Map<string, { prefName: string; score: number; acc: string }>();
		const compoundTargets: Record<number, CompoundTargetRef[]> = {};
		const compoundChembl: Record<number, string | null> = {};
		const enrichedTargets: TargetOut[] = [];

		const snapshot = (partial: boolean): PlantTargets => ({
			targets: [...enrichedTargets].sort((a, b) => b.score - a.score),
			edges,
			compoundTargets,
			compoundChembl,
			partial
		});

		const work = (async () => {
			// Phase A — ChEMBL targets per compound (bounded to 4, tolerant of failure).
			const picks = base.compounds.slice(0, 4);
			const chembl = await Promise.allSettled(picks.map((c) => getTargets(c.inchikey, c.name, 3)));
			picks.forEach((c, i) => {
				const r = chembl[i];
				if (r.status !== 'fulfilled') return;
				compoundChembl[c.cid] = r.value.chemblId;
				const refs: CompoundTargetRef[] = [];
				for (const t of r.value.targets) {
					if (!t.accession) continue;
					refs.push({ accession: t.accession, score: round(t.score), evidence: t.evidence, mechanism: t.mechanism });
					edges.push({ compound: c.name, target: t.accession, score: round(t.score), evidence: t.evidence });
					const prev = targetMap.get(t.accession);
					if (!prev || t.score > prev.score) {
						targetMap.set(t.accession, { prefName: bestName(t), score: Math.max(prev?.score ?? 0, t.score), acc: t.accession });
					}
				}
				compoundTargets[c.cid] = refs;
			});

			// Phase B — enrich the top unique targets (UniProt identity + Open Targets
			// diseases). Each pushes as it resolves so the snapshot stays current.
			const unique = [...targetMap.values()].sort((a, b) => b.score - a.score).slice(0, 10);
			await Promise.allSettled(
				unique.map(async (t) => {
					const prot = await getProteinByAccession(t.acc).catch(() => null);
					const ensembl = prot?.ensemblGene ?? null;
					const diseases = ensembl ? await getDiseases(ensembl, 4).catch(() => []) : [];
					enrichedTargets.push({
						accession: t.acc,
						prefName: t.prefName,
						gene: prot?.gene ?? null,
						proteinName: prot?.name ?? t.prefName,
						ensembl,
						category: shortFn(prot?.fn ?? null),
						score: round(t.score),
						diseases
					});
				})
			);
			return snapshot(false);
		})();

		let finished = false;
		const result = await Promise.race<PlantTargets>([
			work.then((v) => {
				finished = true;
				return v;
			}),
			new Promise<PlantTargets>((resolve) => setTimeout(() => !finished && resolve(snapshot(true)), TARGETS_BUDGET_MS))
		]);

		// If the budget expired with nothing resolved, throw so the empty result is
		// not cached — the next request retries (ChEMBL slowness is usually transient).
		if (result.partial && result.targets.length === 0) {
			throw new Error(`target resolution timed out for ${slug} (ChEMBL slow)`);
		}
		return result;
	});
}

// ── Combined profile (used by the reverse index & pathways). ──────────────────
export async function getPlantProfile(slug: string): Promise<PlantProfile | null> {
	const base = await getPlantBase(slug);
	if (!base) return null;
	const tg = await getPlantTargets(slug).catch(() => null);
	const compounds = base.compounds.map((c) => ({
		...c,
		chemblId: tg?.compoundChembl?.[c.cid] ?? c.chemblId,
		targets: tg?.compoundTargets?.[c.cid] ?? []
	}));
	return {
		...base,
		compounds,
		targets: tg?.targets ?? [],
		edges: tg?.edges ?? []
	};
}

function round(n: number): number {
	return Math.round(n * 100) / 100;
}
function bestName(t: ChemblTarget): string {
	return t.prefName && t.prefName !== t.targetChemblId ? t.prefName : t.targetChemblId;
}
function shortFn(fn: string | null): string | null {
	if (!fn) return null;
	const clause = fn.split(/[.;]/)[0].trim();
	return clause.length > 90 ? clause.slice(0, 87) + '…' : clause;
}
