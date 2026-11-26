// STRING functional enrichment — network pharmacology for a target-gene set.
// Returns the pathways/processes a plant's targets collectively light up.
import { getJSON } from '../http';
import { cached } from '../cache';

const BASE = 'https://string-db.org/api/json/enrichment';

export type Pathway = {
	source: string; // KEGG | Reactome | GO:BP | WikiPathways
	term: string;
	name: string;
	fdr: number;
	genes: string[];
	count: number;
};

export type Enrichment = {
	pathways: Pathway[];
	genesUsed: string[];
	pathwayCount: number;
};

type Raw = {
	category: string;
	term: string;
	description: string;
	fdr: string | number;
	number_of_genes: number;
	inputGenes: string[];
};

const LABEL: Record<string, string> = {
	KEGG: 'KEGG',
	RCTM: 'Reactome',
	Process: 'GO:BP',
	WikiPathways: 'WikiPathways'
};

export function getEnrichment(genes: string[], topN = 12): Promise<Enrichment> {
	const clean = [...new Set(genes.filter(Boolean))];
	if (clean.length < 2) return Promise.resolve({ pathways: [], genesUsed: clean, pathwayCount: 0 });
	const key = `enrich:${clean.sort().join(',')}:${topN}`;
	return cached(key, 3 * 24 * 3600_000, async () => {
		try {
			const url = `${BASE}?identifiers=${encodeURIComponent(clean.join('\r'))}&species=9606`;
			const raw = await getJSON<Raw[]>(url);
			const keep = raw.filter((r) => LABEL[r.category]);
			// de-duplicate by lowercased description, keeping the most significant.
			const seen = new Map<string, Pathway>();
			for (const r of keep.sort((a, b) => Number(a.fdr) - Number(b.fdr))) {
				const name = r.description;
				const dk = name.toLowerCase();
				if (seen.has(dk)) continue;
				seen.set(dk, {
					source: LABEL[r.category],
					term: r.term,
					name,
					fdr: Number(r.fdr),
					genes: r.inputGenes ?? [],
					count: r.number_of_genes
				});
			}
			const pathways = [...seen.values()].sort((a, b) => a.fdr - b.fdr).slice(0, topN);
			return { pathways, genesUsed: clean, pathwayCount: seen.size };
		} catch {
			return { pathways: [], genesUsed: clean, pathwayCount: 0 };
		}
	});
}
