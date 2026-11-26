import { json, error } from '@sveltejs/kit';
import { getPlantProfile } from '#lib/server/orchestrate';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const profile = await getPlantProfile(params.slug);
	if (!profile) throw error(404, `Unknown plant: ${params.slug}`);
	setHeaders({ 'cache-control': 'public, max-age=300' });
	return json(profile);
};

// Allow the live cross-database fan-out enough time on Vercel.
export const config = { maxDuration: 60 };
