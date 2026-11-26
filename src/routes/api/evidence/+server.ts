import { json, error } from '@sveltejs/kit';
import { coMentionCount } from '#lib/server/sources/pubmed';
import type { RequestHandler } from './$types';

// Live literature evidence for an API + excipient pairing.
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const a = (url.searchParams.get('a') ?? '').trim();
	const b = (url.searchParams.get('b') ?? '').trim();
	if (!a || !b) throw error(400, 'need a and b');
	const count = await coMentionCount(a, b);
	setHeaders({ 'cache-control': 'public, max-age=3600' });
	return json({
		a,
		b,
		count,
		url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(`"${a}" AND "${b}"`)}`
	});
};
