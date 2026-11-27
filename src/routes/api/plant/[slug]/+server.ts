import { json, error } from '@sveltejs/kit';
import { getPlantBase } from '#lib/server/orchestrate';
import { readBase, writeProfile } from '#lib/server/store';
import { hasDb } from '#lib/server/db';
import { withRequestContext } from '#lib/server/cache';
import type { RequestHandler } from './$types';

// Serving path for the FAST half of a plant profile. Store-first (instant,
// outage-proof); otherwise resolve live (seeded catalogue OR any LOTUS species) and,
// when a store is configured, write it through so the species is now materialised.
//
// ?mode=sandbox → CLEAN-ROOM: skip the durable store and the human-seeded catalogue;
// resolve the species purely live and never persist the clean-room result.
export const GET: RequestHandler = async ({ params, url, setHeaders }) => {
	const sandbox = url.searchParams.get('mode') === 'sandbox';
	return withRequestContext({ sandbox, noCache: sandbox }, async () => {
		if (!sandbox) {
			const stored = await readBase(params.slug).catch(() => null);
			if (stored) {
				setHeaders({ 'cache-control': 'public, max-age=300' });
				return json(stored);
			}
		}
		const base = await getPlantBase(params.slug);
		if (!base) throw error(404, `Unknown plant: ${params.slug}`);
		if (!sandbox && hasDb()) await writeProfile(base, null).catch(() => {}); // persist (best-effort)
		setHeaders({ 'cache-control': sandbox ? 'no-store' : 'public, max-age=300' });
		// Only claim LOTUS provenance when the base layer actually resolved via LOTUS
		// (base.sources reflects that); catalogue plants used a curated occurrence list.
		const datasets = base.sources.includes('LOTUS') ? ['LOTUS', 'PubChem', 'PubMed'] : ['PubChem', 'PubMed'];
		return json({ ...base, provenance: { store: false, mode: sandbox ? 'sandbox' : 'demo', fetchedAt: new Date().toISOString(), datasets } });
	});
};

export const config = { maxDuration: 60 };
