import { json, error } from '@sveltejs/kit';
import { saveFormulation, listFormulations } from '#lib/server/store';
import { hasDb } from '#lib/server/db';
import type { RequestHandler } from './$types';

// Save / compare formulations. Requires a configured store; without one, the UI
// still generates dossiers live but cannot persist them.
export const POST: RequestHandler = async ({ request }) => {
	if (!hasDb()) throw error(503, 'no store configured — set DATABASE_URL to save formulations');
	const body = await request.json();
	const { goal, species, formulation } = body ?? {};
	if (!goal || !species || !formulation) throw error(400, 'need goal, species, formulation');
	const id = await saveFormulation({
		goalId: goal.id,
		goalLabel: goal.label,
		slug: species.slug,
		speciesLabel: `${species.common} (${species.scientific})`,
		lead: formulation.lead ?? null,
		route: formulation.route,
		exposureIndex: formulation.exposureIndex,
		coverage: formulation.coverage,
		complementarity: formulation.complementarity?.score ?? 0,
		plan: formulation
	});
	return json({ ok: true, id });
};

export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const goalId = url.searchParams.get('goal') ?? undefined;
	const slug = url.searchParams.get('species') ?? undefined;
	const items = await listFormulations(goalId, slug);
	setHeaders({ 'cache-control': 'no-store' });
	return json({ items });
};
