import { json, error } from '@sveltejs/kit';
import { buildIndex } from '#lib/server/reverse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const mode = url.searchParams.get('mode') ?? 'target';
	const q = (url.searchParams.get('q') ?? '').trim();
	if (!q) throw error(400, 'missing q');
	const idx = await buildIndex();
	setHeaders({ 'cache-control': 'public, max-age=600' });

	if (mode === 'target') {
		const g = q.toUpperCase();
		return json({ mode, q: g, hits: idx.byGene[g] ?? [] });
	}
	if (mode === 'compound') {
		const hits = idx.byCompound[q.toLowerCase()] ?? [];
		return json({ mode, q, hits });
	}
	// disease — allow case-insensitive exact, else contains
	const keys = Object.keys(idx.byDisease);
	const exact = keys.find((k) => k.toLowerCase() === q.toLowerCase());
	const key = exact ?? keys.find((k) => k.toLowerCase().includes(q.toLowerCase()));
	return json({ mode, q: key ?? q, hits: key ? idx.byDisease[key] : [] });
};

// Allow the live cross-database fan-out enough time on Vercel.
export const config = { maxDuration: 60 };
