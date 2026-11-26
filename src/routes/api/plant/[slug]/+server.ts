import { json, error } from '@sveltejs/kit';
import { getPlantBase } from '#lib/server/orchestrate';
import { readBase } from '#lib/server/store';
import type { RequestHandler } from './$types';

// Serving path for the FAST half of a plant profile. Reads from the store when it
// has the plant (instant, outage-proof); otherwise falls back to the live fan-out,
// so the site works identically whether or not a DATABASE_URL is configured.
export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const stored = await readBase(params.slug).catch(() => null);
	if (stored) {
		setHeaders({ 'cache-control': 'public, max-age=300' });
		return json(stored);
	}
	const base = await getPlantBase(params.slug);
	if (!base) throw error(404, `Unknown plant: ${params.slug}`);
	setHeaders({ 'cache-control': 'public, max-age=300' });
	return json({ ...base, provenance: { store: false, fetchedAt: new Date().toISOString(), datasets: ['PubChem', 'PubMed'] } });
};

export const config = { maxDuration: 60 };
