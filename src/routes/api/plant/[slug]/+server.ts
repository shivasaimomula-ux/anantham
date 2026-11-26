import { json, error } from '@sveltejs/kit';
import { getPlantBase } from '#lib/server/orchestrate';
import type { RequestHandler } from './$types';

// The FAST half of a plant profile: identity, traditions, PubChem compounds and
// literature. Returns in a few seconds so the page renders immediately; the heavy
// target network streams in separately from /api/plant/[slug]/targets.
export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const base = await getPlantBase(params.slug);
	if (!base) throw error(404, `Unknown plant: ${params.slug}`);
	setHeaders({ 'cache-control': 'public, max-age=300' });
	return json(base);
};

export const config = { maxDuration: 60 };
