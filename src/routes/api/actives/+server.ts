import { json } from '@sveltejs/kit';
import { buildIndex } from '#lib/server/reverse';
import type { RequestHandler } from './$types';

// Every catalogue active with its resolved targets + structure, for the
// multi-active formula designer.
export const GET: RequestHandler = async ({ setHeaders }) => {
	const idx = await buildIndex();
	setHeaders({ 'cache-control': 'public, max-age=600' });
	return json({ actives: idx.actives });
};

// Allow the live cross-database fan-out enough time on Vercel.
export const config = { maxDuration: 60 };
