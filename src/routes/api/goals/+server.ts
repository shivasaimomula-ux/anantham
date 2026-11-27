import { json } from '@sveltejs/kit';
import { GOAL_INDEX } from '#lib/data/goals';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'public, max-age=3600' });
	return json({ goals: GOAL_INDEX });
};
