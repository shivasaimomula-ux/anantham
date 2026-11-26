// UniProt — CC BY 4.0. Canonical protein identity for a target, plus the
// Ensembl gene id used to query Open Targets.
import { getJSON } from '../http';
import { cached } from '../cache';

const BASE = 'https://rest.uniprot.org/uniprotkb';
const FIELDS = 'accession,protein_name,gene_primary,xref_ensembl,protein_families,cc_function';

export type Protein = {
	accession: string;
	name: string;
	gene: string | null;
	ensemblGene: string | null;
	category: string | null;
	fn: string | null;
};

type Raw = {
	primaryAccession: string;
	proteinDescription?: {
		recommendedName?: { fullName?: { value?: string } };
		submissionNames?: { fullName?: { value?: string } }[];
	};
	genes?: { geneName?: { value?: string } }[];
	proteinFamilies?: unknown;
	comments?: { commentType?: string; texts?: { value?: string }[] }[];
	uniProtKBCrossReferences?: {
		database: string;
		id: string;
		properties?: { key: string; value: string }[];
	}[];
};

function parse(r: Raw): Protein {
	const name =
		r.proteinDescription?.recommendedName?.fullName?.value ??
		r.proteinDescription?.submissionNames?.[0]?.fullName?.value ??
		r.primaryAccession;
	const gene = r.genes?.[0]?.geneName?.value ?? null;

	let ensemblGene: string | null = null;
	for (const x of r.uniProtKBCrossReferences ?? []) {
		if (x.database === 'Ensembl') {
			const g = x.properties?.find((p) => p.key === 'GeneId')?.value;
			if (g) {
				ensemblGene = g.split('.')[0];
				break;
			}
		}
	}

	// A short functional label, derived from the UniProt "function" comment.
	let fn: string | null = null;
	const fnComment = r.comments?.find((c) => c.commentType === 'FUNCTION')?.texts?.[0]?.value;
	if (fnComment) fn = fnComment.length > 220 ? fnComment.slice(0, 217) + '…' : fnComment;

	const category = Array.isArray(r.proteinFamilies)
		? null
		: typeof r.proteinFamilies === 'string'
			? r.proteinFamilies
			: null;

	return { accession: r.primaryAccession, name, gene, ensemblGene, category, fn };
}

export function getProteinByAccession(accession: string): Promise<Protein | null> {
	return cached(`up:acc:${accession}`, 7 * 24 * 3600_000, async () => {
		try {
			const r = await getJSON<Raw>(`${BASE}/${accession}?fields=${FIELDS}&format=json`);
			return parse(r);
		} catch {
			return null;
		}
	});
}

export function getProteinByGene(gene: string): Promise<Protein | null> {
	return cached(`up:gene:${gene.toLowerCase()}`, 7 * 24 * 3600_000, async () => {
		try {
			const r = await getJSON<{ results?: Raw[] }>(
				`${BASE}/search?query=gene_exact:${encodeURIComponent(gene)}+AND+organism_id:9606+AND+reviewed:true&fields=${FIELDS}&format=json&size=1`
			);
			const row = r.results?.[0];
			return row ? parse(row) : null;
		} catch {
			return null;
		}
	});
}
