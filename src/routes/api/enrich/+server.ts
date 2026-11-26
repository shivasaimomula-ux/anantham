import { json, error } from '@sveltejs/kit';
import { getEnrichment } from '#lib/server/sources/enrichment';
import type { RequestHandler } from './$types';

// Pathway enrichment for an arbitrary gene set (combined formula targets).
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const genes = (url.searchParams.get('genes') ?? '')
		.split(',')
		.map((g) => g.trim())
		.filter(Boolean);
	if (genes.length < 2) throw error(400, 'need ≥2 genes');
	const enrichment = await getEnrichment(genes, 10);
	setHeaders({ 'cache-control': 'public, max-age=600' });
	return json(enrichment);
};
