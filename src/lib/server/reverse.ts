// Reverse & convergence index (L1).
// Inverts the per-plant profiles into target→herb, disease→herb and
// compound→herb maps, and derives a cross-tradition convergence view.
import { PLANTS } from '#lib/data/plants';
import { getPlantProfile } from './orchestrate';
import { cached } from './cache';

export type HerbHit = {
	slug: string;
	common: string;
	scientific: string;
	via: string; // the connecting compound(s) or target
	score: number;
};

export type Suggestion = { key: string; label: string; sub?: string; n: number };

export type ConvergentUse = {
	theme: string;
	entries: { slug: string; common: string; system: string }[];
	traditions: number;
	plants: number;
};

export type ActiveTarget = { gene: string; accession: string; score: number; prefName: string };
export type Active = {
	id: string;
	name: string;
	slug: string;
	common: string;
	scientific: string;
	cid: number;
	smiles: string | null;
	inchikey: string | null;
	targets: ActiveTarget[];
};

export type ReverseIndex = {
	byGene: Record<string, HerbHit[]>;
	byDisease: Record<string, HerbHit[]>;
	byCompound: Record<string, { slug: string; common: string }[]>;
	genes: Suggestion[];
	diseases: Suggestion[];
	compounds: Suggestion[];
	convergence: ConvergentUse[];
	actives: Active[];
};

// Canonicalise a traditional-use phrase into a therapeutic theme so that
// "anti-inflammatory" and "inflammation" cluster together.
const STEMS: [RegExp, string][] = [
	[/inflamm/i, 'inflammation'],
	[/pain|analges/i, 'pain'],
	[/digest|stomach|dyspep|carminative|bitter/i, 'digestion'],
	[/antioxid/i, 'antioxidant'],
	[/stress|adaptogen|anxiety|calm|shen/i, 'stress / adaptogen'],
	[/sleep|insomnia|sedat/i, 'sleep'],
	[/immun/i, 'immunity'],
	[/fever|antipyre|heat/i, 'fever'],
	[/nausea|vomit|emetic/i, 'nausea'],
	[/antimicro|antibact|antivir|antifung/i, 'antimicrobial'],
	[/malaria|parasit|anthelmin/i, 'antiparasitic'],
	[/cognit|memory|neuroprotect|brain/i, 'cognition'],
	[/joint|arthrit|rheumat/i, 'joint health'],
	[/skin|wound|derma/i, 'skin / wound'],
	[/liver|hepat|jaundice/i, 'liver'],
	[/vital|rejuven|tonic|energy|fatigue|athletic/i, 'vitality'],
	[/respir|cough|cold|asthma/i, 'respiratory'],
	[/menstru|mense|women|reproduc/i, 'reproductive'],
	[/blood|circul|stasis/i, 'circulation'],
	[/sugar|glucose|diabet/i, 'blood sugar']
];
function theme(use: string): string {
	for (const [re, t] of STEMS) if (re.test(use)) return t;
	return use.toLowerCase();
}

export function buildIndex(): Promise<ReverseIndex> {
	return cached('reverse:index', 6 * 3600_000, async () => {
		const settled = await Promise.allSettled(PLANTS.map((p) => getPlantProfile(p.slug)));
		const profiles = settled
			.filter((s) => s.status === 'fulfilled' && !!s.value)
			.map((s) => (s as PromiseFulfilledResult<NonNullable<Awaited<ReturnType<typeof getPlantProfile>>>>).value);
		// Never cache an all-empty index (upstream busy) — let it self-heal.
		if (profiles.length === 0) throw new Error('no plant profiles resolved (upstream busy)');

		const byGene: Record<string, HerbHit[]> = {};
		const byDisease: Record<string, HerbHit[]> = {};
		const byCompound: Record<string, { slug: string; common: string }[]> = {};
		const geneN: Record<string, number> = {};
		const diseaseN: Record<string, number> = {};
		const compoundN: Record<string, number> = {};
		const actives: Active[] = [];

		for (const pr of profiles) {
			const { slug, common, scientific } = pr.plant;
			const tByAcc = new Map(pr.targets.map((t) => [t.accession, t]));
			// every active with its resolved targets (for the formula designer)
			for (const c of pr.compounds) {
				actives.push({
					id: `${slug}:${c.name}`,
					name: c.name,
					slug,
					common,
					scientific,
					cid: c.cid,
					smiles: c.smiles,
					inchikey: c.inchikey,
					targets: c.targets
						.map((ct) => {
							const t = tByAcc.get(ct.accession);
							return t && t.gene
								? { gene: t.gene, accession: ct.accession, score: ct.score, prefName: t.prefName }
								: null;
						})
						.filter((t): t is ActiveTarget => !!t)
				});
			}
			// compound → herb
			for (const c of pr.compounds) {
				const k = c.name.toLowerCase();
				(byCompound[k] ??= []).push({ slug, common });
				compoundN[k] = (compoundN[k] ?? 0) + 1;
			}
			// target(gene) → herb, with the compounds that hit it
			for (const t of pr.targets) {
				if (!t.gene) continue;
				const g = t.gene.toUpperCase();
				const hitters = pr.compounds
					.filter((c) => c.targets.some((ct) => ct.accession === t.accession))
					.map((c) => c.name);
				(byGene[g] ??= []).push({
					slug,
					common,
					scientific,
					via: hitters.slice(0, 3).join(', ') || t.prefName,
					score: t.score
				});
				geneN[g] = (geneN[g] ?? 0) + 1;
				// disease → herb (through this target)
				for (const d of t.diseases) {
					const dk = d.name;
					(byDisease[dk] ??= []).push({
						slug,
						common,
						scientific,
						via: `${t.gene} (${t.prefName})`,
						score: d.score
					});
					diseaseN[dk] = (diseaseN[dk] ?? 0) + 1;
				}
			}
		}

		// dedupe + sort hit lists by score
		const tidy = (m: Record<string, HerbHit[]>) => {
			for (const k of Object.keys(m)) {
				const best = new Map<string, HerbHit>();
				for (const h of m[k]) {
					const ex = best.get(h.slug);
					if (!ex || h.score > ex.score) best.set(h.slug, h);
				}
				m[k] = [...best.values()].sort((a, b) => b.score - a.score);
			}
		};
		tidy(byGene);
		tidy(byDisease);

		const sug = (n: Record<string, number>, subFn?: (k: string) => string): Suggestion[] =>
			Object.entries(n)
				.map(([key, count]) => ({ key, label: key, sub: subFn?.(key), n: count }))
				.sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));

		// convergence across traditions (from catalogue traditional uses)
		const useMap = new Map<string, Map<string, { slug: string; common: string; system: string }>>();
		for (const p of PLANTS) {
			for (const tr of p.traditions) {
				for (const u of tr.uses) {
					const th = theme(u);
					if (!useMap.has(th)) useMap.set(th, new Map());
					useMap.get(th)!.set(`${p.slug}:${tr.system}`, {
						slug: p.slug,
						common: p.common,
						system: tr.system
					});
				}
			}
		}
		const convergence: ConvergentUse[] = [...useMap.entries()]
			.map(([th, m]) => {
				const entries = [...m.values()];
				return {
					theme: th,
					entries,
					traditions: new Set(entries.map((e) => e.system)).size,
					plants: new Set(entries.map((e) => e.slug)).size
				};
			})
			.filter((c) => c.traditions >= 2)
			.sort((a, b) => b.traditions - a.traditions || b.plants - a.plants || b.entries.length - a.entries.length);

		return {
			byGene,
			byDisease,
			byCompound,
			genes: sug(geneN),
			diseases: sug(diseaseN),
			compounds: sug(compoundN),
			convergence,
			actives
		};
	});
}
