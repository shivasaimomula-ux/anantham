// PubMed via NCBI E-utilities. Literature volume as a simple evidence signal.
// Uses an API key (env NCBI_API_KEY) to lift the shared-IP rate limit.
import { getJSON } from '../http';
import { cached } from '../cache';
import { env } from '$env/dynamic/private';

const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

function keyParam(): string {
	return env.NCBI_API_KEY ? `&api_key=${env.NCBI_API_KEY}` : '';
}

export type LitResult = { count: number; query: string; url: string };

/** Count PubMed records for a free-text term (quoted for precision). */
export function litCount(term: string): Promise<LitResult> {
	const q = `"${term}"`;
	return cached(`pm:${q.toLowerCase()}`, 24 * 3600_000, async () => {
		const url = `${BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(q)}&retmode=json&retmax=0${keyParam()}`;
		const human = `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(q)}`;
		// No try/catch: a fetch FAILURE (timeout/429/5xx) must propagate so `cached`
		// never stores it as "0 papers" for 24h. A successful response with count 0 is
		// a genuine zero and IS cached. Callers that want a soft fallback use .catch().
		const r = await getJSON<{ esearchresult?: { count?: string } }>(url);
		return { count: Number(r.esearchresult?.count ?? 0), query: q, url: human };
	});
}

/** Co-occurrence count: plant AND compound — a crude plant↔compound literature link. */
export function coMentionCount(a: string, b: string): Promise<number> {
	const term = `"${a}" AND "${b}"`;
	return cached(`pm:co:${term.toLowerCase()}`, 24 * 3600_000, async () => {
		const url = `${BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term)}&retmode=json&retmax=0${keyParam()}`;
		// A fetch failure propagates (not cached as 0); a true zero is cached.
		const r = await getJSON<{ esearchresult?: { count?: string } }>(url);
		return Number(r.esearchresult?.count ?? 0);
	});
}
