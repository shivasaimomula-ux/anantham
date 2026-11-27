import { json } from '@sveltejs/kit';
import { PLANTS } from '#lib/data/plants';
import { searchStoredTaxa } from '#lib/server/store';
import { searchTaxa } from '#lib/server/sources/lotus';
import { slugify } from '#lib/server/resolve';
import type { RequestHandler } from './$types';

// Species search / autocomplete. Merges three sources, best-first:
//   1. seeded catalogue (curated, instant)   2. already-materialised store rows
//   3. anything in LOTUS (Wikidata)           — so any species is reachable.
export type SearchHit = { slug: string; scientific: string; common: string | null; source: 'catalog' | 'store' | 'lotus' };

export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	if (q.length < 2) return json({ q, hits: [] });

	const hits: SearchHit[] = [];
	const seen = new Set<string>();
	const add = (h: SearchHit) => {
		if (seen.has(h.slug)) return;
		seen.add(h.slug);
		hits.push(h);
	};

	const ql = q.toLowerCase();
	for (const p of PLANTS) {
		if (p.common.toLowerCase().includes(ql) || p.scientific.toLowerCase().includes(ql)) {
			add({ slug: p.slug, scientific: p.scientific, common: p.common, source: 'catalog' });
		}
	}
	for (const r of await searchStoredTaxa(q)) {
		add({ slug: r.slug, scientific: r.scientific, common: r.common, source: 'store' });
	}
	if (hits.length < 6) {
		const lotus = await searchTaxa(q, 8).catch(() => []);
		for (const t of lotus) {
			if (!t.scientific.includes(' ')) continue; // species (binomial) only, not genera
			add({ slug: slugify(t.scientific), scientific: t.scientific, common: t.common, source: 'lotus' });
		}
	}

	setHeaders({ 'cache-control': 'public, max-age=600' });
	return json({ q, hits: hits.slice(0, 10) });
};

export const config = { maxDuration: 30 };
