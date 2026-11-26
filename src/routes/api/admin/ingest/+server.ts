import { json, error } from '@sveltejs/kit';
import { migrate } from '#lib/server/store';
import { ingestPlant, ingestAll } from '#lib/server/ingest';
import type { RequestHandler } from './$types';

// Admin-only: materialise plant profiles into the store. Run offline (curl/cron),
// never in the serving path. Protected by ADMIN_TOKEN.
//   POST /api/admin/ingest?slug=turmeric   -> ingest one
//   POST /api/admin/ingest?all=1           -> ingest all (local / adapter-node only;
//                                             on Vercel's 60s cap, ingest per-slug)
export const POST: RequestHandler = async ({ url, request }) => {
	if (!process.env.DATABASE_URL) throw error(503, 'no DATABASE_URL configured');
	const token = process.env.ADMIN_TOKEN;
	const given = request.headers.get('x-admin-token') ?? url.searchParams.get('token');
	if (!token || given !== token) throw error(401, 'unauthorized');

	await migrate();

	if (url.searchParams.get('all')) {
		const results = await ingestAll();
		return json({ ok: results.every((r) => r.ok), results });
	}
	const slug = url.searchParams.get('slug');
	if (!slug) throw error(400, 'missing slug (or all=1)');
	const result = await ingestPlant(slug);
	return json(result);
};

export const config = { maxDuration: 60 };
