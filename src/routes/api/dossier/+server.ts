import { json, error } from '@sveltejs/kit';
import { designForGoal } from '#lib/server/goal';
import { withRequestContext } from '#lib/server/cache';
import type { RequestHandler } from './$types';

// Goal-first dossier: measures a species' actives against a goal's targets (directed
// ChEMBL query) and returns the ranked actives, MOA, formulation and the explicit
// database-reasoning chain. Live + cached; first generation is slow, then instant.
//
// ?mode=sandbox → CLEAN-ROOM: human-seeded catalogue + cache are bypassed so the
// monograph is derived purely live (the only seeded element, the goal, is returned
// tagged as an a-priori hypothesis). This is the mode for validation, not demos.
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const goal = url.searchParams.get('goal');
	const species = url.searchParams.get('species');
	const sandbox = url.searchParams.get('mode') === 'sandbox';
	if (!goal || !species) throw error(400, 'need goal and species');
	const dossier = await withRequestContext({ sandbox, noCache: sandbox }, () => designForGoal(goal, species));
	if (!dossier) throw error(404, 'unknown goal or species, or no actives resolved');
	// Never let a clean-room result sit in a shared HTTP cache either.
	setHeaders({ 'cache-control': sandbox ? 'no-store' : 'public, max-age=600' });
	return json(dossier);
};

export const config = { maxDuration: 60 };
