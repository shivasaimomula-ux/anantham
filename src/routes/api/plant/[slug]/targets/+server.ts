import { json, error } from '@sveltejs/kit';
import { getPlantTargets } from '#lib/server/orchestrate';
import type { RequestHandler } from './$types';

// The SLOW half of a plant profile: ChEMBL → UniProt → Open Targets. Time-budgeted
// so it returns partial results instead of ever hitting Vercel's function timeout.
export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const targets = await getPlantTargets(params.slug);
	if (!targets) throw error(404, `Unknown plant: ${params.slug}`);
	// Don't cache partial results for long — let them re-resolve soon.
	setHeaders({ 'cache-control': targets.partial ? 'public, max-age=30' : 'public, max-age=300' });
	return json(targets);
};

export const config = { maxDuration: 60 };
