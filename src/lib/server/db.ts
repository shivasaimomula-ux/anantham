// Postgres client — the durable "memory" layer. Gated on DATABASE_URL: when it is
// not set (e.g. the current Vercel deploy), db() returns null and every caller
// falls back to the live fan-out, so v1 keeps working unchanged. Once a DATABASE_URL
// is configured and the plants are ingested, reads come from here — instant and
// immune to upstream (ChEMBL/EBI) outages.
//
// Reads process.env directly (not $env/dynamic/private) so the same module works
// both inside SvelteKit and from a standalone ingest context.
import postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;
let cached: Sql | null | undefined;

export function db(): Sql | null {
	if (cached !== undefined) return cached;
	const url = process.env.DATABASE_URL;
	cached = url
		? postgres(url, {
				max: 1, // serverless-friendly; one socket per function instance
				idle_timeout: 20,
				connect_timeout: 10,
				prepare: false // compatible with pgBouncer / Neon / Supabase poolers
			})
		: null;
	return cached;
}

export function hasDb(): boolean {
	return !!process.env.DATABASE_URL;
}
