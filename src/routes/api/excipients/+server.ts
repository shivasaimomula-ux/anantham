import { json } from '@sveltejs/kit';
import { EXCIPIENTS, FDA_TERMS } from '#lib/data/excipients';
import { ingredientUsage } from '#lib/server/sources/openfda';
import type { RequestHandler } from './$types';

// Excipient knowledge base + LIVE openFDA regulatory precedent.
export const GET: RequestHandler = async ({ setHeaders }) => {
	const enriched = await Promise.all(
		EXCIPIENTS.map(async (e) => {
			const term = FDA_TERMS[e.id] ?? null;
			const fdaProducts = term ? await ingredientUsage(term) : null;
			return { ...e, fdaTerm: term, fdaProducts };
		})
	);
	setHeaders({ 'cache-control': 'public, max-age=3600' });
	return json({ excipients: enriched });
};

// Allow the live cross-database fan-out enough time on Vercel.
export const config = { maxDuration: 60 };
