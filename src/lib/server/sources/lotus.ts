// LOTUS (naturalproducts.net) via Wikidata — plant → compound occurrences, CC0.
// This is what lets ANY species be profiled, not just the seeded catalogue.
// Wikidata hosts the LOTUS dataset: P703 "found in taxon", P235 InChIKey,
// P662 PubChem CID, P225 taxon name, P1843 common name, P171 parent taxon.
import { getJSON } from '../http';
import { cached } from '../cache';

const ENDPOINT = 'https://query.wikidata.org/sparql';

type Binding = Record<string, { value: string } | undefined>;
type SparqlResult = { results?: { bindings?: Binding[] } };

async function sparql<T = SparqlResult>(query: string, timeoutMs = 30000, retries = 1): Promise<T> {
	const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
	return getJSON<T>(url, { timeoutMs, retries, accept: 'application/sparql-results+json' });
}

export type LotusCompound = { name: string; cid?: number; inchikey?: string; refs: number };

/**
 * Compounds recorded in a taxon, ranked by reference count (how well-documented the
 * occurrence is). Falls back to an unranked query if the ranked one is slow/empty.
 * Only compounds with a PubChem CID or InChIKey are kept (needed downstream).
 */
export function lotusOccurrences(scientific: string, limit = 10): Promise<LotusCompound[]> {
	return cached(`lotus:occ:${scientific.toLowerCase()}`, 7 * 24 * 3600_000, async () => {
		const ranked = `SELECT ?cLabel ?cid ?inchikey (COUNT(DISTINCT ?ref) AS ?refs) WHERE {
  ?taxon wdt:P225 "${esc(scientific)}".
  ?c wdt:P703 ?taxon ; p:P703 ?stmt .
  ?stmt prov:wasDerivedFrom ?ref .
  OPTIONAL { ?c wdt:P662 ?cid. }
  OPTIONAL { ?c wdt:P235 ?inchikey. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} GROUP BY ?cLabel ?cid ?inchikey ORDER BY DESC(?refs) LIMIT ${limit * 3}`;

		let rows: Binding[] = [];
		try {
			// Tight budget, no retry: for heavily-studied taxa the ref-count scan is
			// slow, so fail fast to the cheap unranked query rather than stall the request.
			rows = (await sparql(ranked, 12000, 0)).results?.bindings ?? [];
		} catch {
			/* fall back below */
		}
		if (!rows.length) {
			const plain = `SELECT ?cLabel ?cid ?inchikey WHERE {
  ?taxon wdt:P225 "${esc(scientific)}".
  ?c wdt:P703 ?taxon.
  OPTIONAL { ?c wdt:P662 ?cid. }
  OPTIONAL { ?c wdt:P235 ?inchikey. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT ${limit * 3}`;
			rows = (await sparql(plain)).results?.bindings ?? [];
		}

		const seen = new Set<string>();
		const out: LotusCompound[] = [];
		for (const b of rows) {
			const name = b.cLabel?.value?.trim();
			const cid = b.cid ? Number(b.cid.value) : undefined;
			const inchikey = b.inchikey?.value;
			if (!name || (!cid && !inchikey)) continue;
			const key = cid ? `cid:${cid}` : `ik:${inchikey}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.push({ name, cid, inchikey, refs: b.refs ? Number(b.refs.value) : 0 });
			if (out.length >= limit) break;
		}
		return out;
	});
}

export type TaxonInfo = { scientific: string; common: string | null; family: string | null; wikidata: string | null; ncbi: number | null };

/** Resolve a scientific name to its common name, family, Wikidata QID and NCBI id. */
export function resolveTaxon(scientific: string): Promise<TaxonInfo | null> {
	return cached(`lotus:taxon:${scientific.toLowerCase()}`, 7 * 24 * 3600_000, async () => {
		const q = `SELECT ?t ?common ?familyName ?ncbi WHERE {
  ?t wdt:P225 "${esc(scientific)}".
  OPTIONAL { ?t wdt:P1843 ?common. FILTER(LANG(?common)="en") }
  OPTIONAL { ?t wdt:P171* ?fam. ?fam wdt:P105 wd:Q35409 ; wdt:P225 ?familyName. }
  OPTIONAL { ?t wdt:P685 ?ncbi. }
} LIMIT 1`;
		const rows = (await sparql(q)).results?.bindings ?? [];
		if (!rows.length) return null;
		const r = rows[0];
		const qid = r.t?.value?.split('/').pop() ?? null;
		return {
			scientific,
			common: r.common?.value ?? null,
			family: r.familyName?.value ?? null,
			wikidata: qid,
			ncbi: r.ncbi ? Number(r.ncbi.value) : null
		};
	});
}

export type TaxonHit = { scientific: string; common: string | null };

/** Autocomplete: taxa whose label matches `q` (via Wikidata entity search). */
export function searchTaxa(q: string, limit = 8): Promise<TaxonHit[]> {
	const query = q.trim();
	if (query.length < 2) return Promise.resolve([]);
	return cached(`lotus:search:${query.toLowerCase()}`, 24 * 3600_000, async () => {
		const sq = `SELECT ?name (SAMPLE(?c) AS ?common) WHERE {
  SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:api "EntitySearch"; wikibase:endpoint "www.wikidata.org";
      mwapi:search "${esc(query)}"; mwapi:language "en".
    ?t wikibase:apiOutputItem mwapi:item.
  }
  ?t wdt:P225 ?name.
  OPTIONAL { ?t wdt:P1843 ?c. FILTER(LANG(?c)="en") }
} GROUP BY ?name LIMIT ${limit}`;
		let rows: Binding[] = [];
		try {
			rows = (await sparql<SparqlResult>(sq, 12000)).results?.bindings ?? [];
		} catch {
			return [];
		}
		const seen = new Set<string>();
		const out: TaxonHit[] = [];
		for (const b of rows) {
			const scientific = b.name?.value?.trim();
			if (!scientific || seen.has(scientific)) continue;
			seen.add(scientific);
			out.push({ scientific, common: b.common?.value ?? null });
		}
		return out;
	});
}

function esc(s: string): string {
	return s.replace(/["\\]/g, '\\$&');
}
