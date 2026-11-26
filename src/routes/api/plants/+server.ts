import { json } from '@sveltejs/kit';
import { PLANT_INDEX } from '#lib/data/plants';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'public, max-age=3600' });
	return json({ plants: PLANT_INDEX });
};
