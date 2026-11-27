import { json, error } from '@sveltejs/kit';
import { designForGoal } from '#lib/server/goal';
import type { RequestHandler } from './$types';

// Goal-first dossier: measures a species' actives against a goal's targets (directed
// ChEMBL query) and returns the ranked actives, MOA, formulation and the explicit
// database-reasoning chain. Live + cached; first generation is slow, then instant.
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const goal = url.searchParams.get('goal');
	const species = url.searchParams.get('species');
	if (!goal || !species) throw error(400, 'need goal and species');
	const dossier = await designForGoal(goal, species);
	if (!dossier) throw error(404, 'unknown goal or species, or no actives resolved');
	setHeaders({ 'cache-control': 'public, max-age=600' });
	return json(dossier);
};

export const config = { maxDuration: 60 };
