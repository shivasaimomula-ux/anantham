import { json, error } from '@sveltejs/kit';
import { getPlantProfile } from '#lib/server/orchestrate';
import { getEnrichment } from '#lib/server/sources/enrichment';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const profile = await getPlantProfile(params.slug);
	if (!profile) throw error(404, 'unknown plant');
	const genes = profile.targets.map((t) => t.gene).filter((g): g is string => !!g);
	const enrichment = await getEnrichment(genes, 12);
	setHeaders({ 'cache-control': 'public, max-age=600' });
	return json({ slug: params.slug, targets: genes.length, ...enrichment });
};

// Allow the live cross-database fan-out enough time on Vercel.
export const config = { maxDuration: 60 };
