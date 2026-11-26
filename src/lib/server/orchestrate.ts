// Assembles a full "plant → compounds → targets → diseases" profile by fanning
// out across the open databases, then merging. Heavily cached per plant.
import { getPlant, type Plant } from '#lib/data/plants';
import { cached } from './cache';
import { getCompound, type PubChemCompound } from './sources/pubchem';
import { getTargets, type ChemblTarget } from './sources/chembl';
import { getProteinByAccession } from './sources/uniprot';
import { getDiseases, type DiseaseLink } from './sources/opentargets';
import { litCount, coMentionCount } from './sources/pubmed';

export type CompoundOut = PubChemCompound & {
	chemblId: string | null;
	literature: number; // co-mentions with the plant
	targets: { accession: string; score: number; evidence: string; mechanism?: string }[];
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

export type PlantProfile = {
	plant: Pick<Plant, 'slug' | 'common' | 'scientific' | 'family' | 'blurb' | 'taxon' | 'traditions'>;
	compounds: CompoundOut[];
	targets: TargetOut[];
	edges: Edge[];
	literature: { count: number; url: string };
	sources: string[];
	generatedAt: string;
};

const SOURCES = ['LOTUS', 'PubChem', 'ChEMBL', 'UniProt', 'Open Targets', 'AlphaFold', 'PubMed'];

export function getPlantProfile(slug: string): Promise<PlantProfile | null> {
	return cached(`profile:${slug}`, 6 * 3600_000, async () => {
		const plant = getPlant(slug);
		if (!plant) return null;

		// 1. Resolve compounds via PubChem (parallel, tolerant of partial failure).
		const picks = plant.compounds.slice(0, 5);
		const settled = await Promise.allSettled(picks.map((c) => getCompound(c)));
		const resolved = picks
			.map((c, i) => {
				const s = settled[i];
				return s.status === 'fulfilled' && s.value ? { c, pub: s.value } : null;
			})
			.filter((x): x is { c: (typeof plant.compounds)[number]; pub: PubChemCompound } => !!x);
		// If NOTHING resolved, the upstream is busy — throw so this empty result
		// is never cached (it self-heals on the next request).
		if (resolved.length === 0) throw new Error(`compound resolution failed for ${slug} (upstream busy)`);

		// 2. ChEMBL targets per compound (parallel) + plant co-mention literature.
		const [chembl, coLit] = await Promise.all([
			Promise.all(resolved.map((x) => getTargets(x.pub.inchikey, x.c.name, 4))),
			Promise.all(resolved.map((x) => coMentionCount(plant.scientific, x.c.name)))
		]);

		// 3. Merge targets by accession; build edges.
		const targetMap = new Map<string, { prefName: string; score: number; acc: string }>();
		const edges: Edge[] = [];
		const compounds: CompoundOut[] = resolved.map((x, i) => {
			const ctargets: CompoundOut['targets'] = [];
			for (const t of chembl[i].targets) {
				if (!t.accession) continue;
				ctargets.push({ accession: t.accession, score: round(t.score), evidence: t.evidence, mechanism: t.mechanism });
				edges.push({ compound: x.pub.name, target: t.accession, score: round(t.score), evidence: t.evidence });
				const prev = targetMap.get(t.accession);
				if (!prev || t.score > prev.score) {
					targetMap.set(t.accession, { prefName: bestName(t), score: Math.max(prev?.score ?? 0, t.score), acc: t.accession });
				}
			}
			return {
				...x.pub,
				chemblId: chembl[i].chemblId,
				literature: coLit[i],
				targets: ctargets
			};
		});

		// 4. Enrich each unique target: UniProt identity, then Open Targets diseases.
		const targets: TargetOut[] = await Promise.all(
			[...targetMap.values()].map(async (t) => {
				const prot = await getProteinByAccession(t.acc);
				const ensembl = prot?.ensemblGene ?? null;
				const diseases = ensembl ? await getDiseases(ensembl, 4) : [];
				return {
					accession: t.acc,
					prefName: t.prefName,
					gene: prot?.gene ?? null,
					proteinName: prot?.name ?? t.prefName,
					ensembl,
					category: shortFn(prot?.fn ?? null),
					score: round(t.score),
					diseases
				};
			})
		);
		targets.sort((a, b) => b.score - a.score);

		const lit = await litCount(plant.scientific);

		return {
			plant: {
				slug: plant.slug,
				common: plant.common,
				scientific: plant.scientific,
				family: plant.family,
				blurb: plant.blurb,
				taxon: plant.taxon,
				traditions: plant.traditions
			},
			compounds,
			targets,
			edges,
			literature: { count: lit.count, url: lit.url },
			sources: SOURCES,
			generatedAt: new Date().toISOString()
		};
	});
}

function round(n: number): number {
	return Math.round(n * 100) / 100;
}
function bestName(t: ChemblTarget): string {
	return t.prefName && t.prefName !== t.targetChemblId ? t.prefName : t.targetChemblId;
}
function shortFn(fn: string | null): string | null {
	if (!fn) return null;
	// first clause of the UniProt function text
	const clause = fn.split(/[.;]/)[0].trim();
	return clause.length > 90 ? clause.slice(0, 87) + '…' : clause;
}
