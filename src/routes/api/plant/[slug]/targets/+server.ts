import { json, error } from '@sveltejs/kit';
import { getPlantBase, getPlantTargets } from '#lib/server/orchestrate';
import { readTargets, writeProfile } from '#lib/server/store';
import { hasDb } from '#lib/server/db';
import type { RequestHandler } from './$types';

// Serving path for the SLOW half (targets). Store-first (instant, immune to a
// ChEMBL/EBI outage); otherwise resolve live, time-budgeted, and write the full
// profile (base + targets) through to the store on first view.
export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const stored = await readTargets(params.slug).catch(() => null);
	if (stored) {
		setHeaders({ 'cache-control': 'public, max-age=300' });
		return json(stored);
	}
	const targets = await getPlantTargets(params.slug);
	if (!targets) throw error(404, `Unknown plant: ${params.slug}`);
	if (hasDb()) {
		const base = await getPlantBase(params.slug).catch(() => null);
		if (base) await writeProfile(base, targets).catch(() => {}); // persist full profile
	}
	setHeaders({ 'cache-control': targets.partial ? 'public, max-age=30' : 'public, max-age=300' });
	return json({ ...targets, provenance: { store: false, fetchedAt: new Date().toISOString(), datasets: ['ChEMBL', 'UniProt', 'Open Targets'] } });
};

export const config = { maxDuration: 60 };
