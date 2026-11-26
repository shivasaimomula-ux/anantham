import { json } from '@sveltejs/kit';
import { buildIndex } from '#lib/server/reverse';
import type { RequestHandler } from './$types';

// Suggestion lists + convergence (the heavy hit-maps are queried via /search).
export const GET: RequestHandler = async ({ setHeaders }) => {
	const idx = await buildIndex();
	setHeaders({ 'cache-control': 'public, max-age=600' });
	return json({
		genes: idx.genes,
		diseases: idx.diseases,
		compounds: idx.compounds,
		convergence: idx.convergence
	});
};

// Allow the live cross-database fan-out enough time on Vercel.
export const config = { maxDuration: 60 };
