import { error } from '@sveltejs/kit';
import { getSDF } from '#lib/server/sources/pubchem';
import type { RequestHandler } from './$types';

// Proxies a PubChem 3D/2D SDF so the browser (3Dmol.js) can load it same-origin.
export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const cid = Number(params.cid);
	if (!Number.isFinite(cid)) throw error(400, 'bad cid');
	const sdf = await getSDF(cid);
	if (!sdf) throw error(404, 'no structure');
	setHeaders({ 'content-type': 'chemical/x-mdl-sdfile', 'cache-control': 'public, max-age=86400' });
	return new Response(sdf);
};
