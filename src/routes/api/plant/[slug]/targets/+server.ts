import { json, error } from '@sveltejs/kit';
import { getPlantTargets } from '#lib/server/orchestrate';
import { readTargets } from '#lib/server/store';
import type { RequestHandler } from './$types';

// Serving path for the SLOW half (targets). Store first (instant, immune to a
// ChEMBL/EBI outage); live, time-budgeted fan-out as fallback.
export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const stored = await readTargets(params.slug).catch(() => null);
	if (stored) {
		setHeaders({ 'cache-control': 'public, max-age=300' });
		return json(stored);
	}
	const targets = await getPlantTargets(params.slug);
	if (!targets) throw error(404, `Unknown plant: ${params.slug}`);
	setHeaders({ 'cache-control': targets.partial ? 'public, max-age=30' : 'public, max-age=300' });
	return json({ ...targets, provenance: { store: false, fetchedAt: new Date().toISOString(), datasets: ['ChEMBL', 'UniProt', 'Open Targets'] } });
};

export const config = { maxDuration: 60 };
