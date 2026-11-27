// Ingest layer: run the LIVE fan-out once and materialise it into the store.
// This is the only place that calls the slow upstreams for a plant going forward.
// Run offline (admin route / cron), never in the serving path.
import { getPlantBase, getPlantTargets } from './orchestrate';
import { writeProfile, logRun } from './store';
import { PLANTS } from '#lib/data/plants';

export type IngestResult = { slug: string; ok: boolean; compounds: number; targets: number; ms: number; error?: string };

export async function ingestPlant(slug: string): Promise<IngestResult> {
	const t0 = Date.now();
	try {
		const base = await getPlantBase(slug);
		if (!base) return { slug, ok: false, compounds: 0, targets: 0, ms: Date.now() - t0, error: 'unknown plant' };
		// Targets may be slow/partial. Never persist a PARTIAL target graph as final —
		// it would freeze an incomplete network into the store. Write base only and
		// leave targets for a later re-ingest once the upstream recovers.
		const tg = await getPlantTargets(slug).catch(() => null);
		const finalTg = tg && !tg.partial ? tg : null;
		await writeProfile(base, finalTg);
		const persistedTargets = finalTg?.targets.length ?? 0;
		const r: IngestResult = { slug, ok: true, compounds: base.compounds.length, targets: persistedTargets, ms: Date.now() - t0 };
		await logRun(slug, 'ok', `${r.compounds} compounds, ${persistedTargets} targets${tg?.partial ? ' (targets partial — base only, not persisted)' : ''}`, persistedTargets);
		return r;
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		await logRun(slug, 'error', msg, 0);
		return { slug, ok: false, compounds: 0, targets: 0, ms: Date.now() - t0, error: msg };
	}
}

export async function ingestAll(): Promise<IngestResult[]> {
	const out: IngestResult[] = [];
	for (const p of PLANTS) {
		out.push(await ingestPlant(p.slug)); // sequential — polite to upstreams
	}
	return out;
}
