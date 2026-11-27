// Tiny in-memory TTL cache + in-flight de-duplication + a concurrency limiter.
// Keeps repeated external API calls cheap and polite within a single server instance.
import { AsyncLocalStorage } from 'node:async_hooks';

type Entry<T> = { value: T; expires: number };
const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

// Cache namespace — bump this whenever a cached payload's SHAPE changes, so old
// entries can never be served against new code (the staleness class of bug).
const CACHE_VERSION = 'v3';

// ── Request-scoped context ────────────────────────────────────────────────────
// Carries per-request flags WITHOUT threading them through every function signature.
//   sandbox  — clean-room mode: ignore human-seeded catalogue entries; resolve live.
//   noCache  — never read OR write the cache (force a fresh derivation this request).
// Both are consulted implicitly by cached() and resolvePlant(), so a single wrap at
// the request boundary flips the whole pipeline into clean-room behaviour.
export type RequestContext = { sandbox?: boolean; noCache?: boolean };
const als = new AsyncLocalStorage<RequestContext>();

export function withRequestContext<T>(ctx: RequestContext, fn: () => T): T {
	return als.run(ctx, fn);
}
export function getRequestContext(): RequestContext | undefined {
	return als.getStore();
}

export async function cached<T>(rawKey: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
	// Clean-room: no read, no write, no in-flight sharing — every value is derived
	// fresh this request so a cached prior can never masquerade as a live finding.
	if (als.getStore()?.noCache) return fn();

	const key = `${CACHE_VERSION}:${rawKey}`;
	const hit = store.get(key) as Entry<T> | undefined;
	const now = Date.now();
	if (hit && hit.expires > now) return hit.value;

	const pending = inflight.get(key) as Promise<T> | undefined;
	if (pending) return pending;

	const p = (async () => {
		try {
			const value = await fn();
			store.set(key, { value, expires: Date.now() + ttlMs });
			return value;
		} finally {
			inflight.delete(key);
		}
	})();
	inflight.set(key, p);
	return p;
}

// Rate limiter: serializes calls so they fire no faster than one per
// `minIntervalMs` (used to stay under PubChem's ~5 req/sec cap).
export function createRateLimiter(minIntervalMs: number) {
	let last = 0;
	let chain: Promise<unknown> = Promise.resolve();
	return function rate<T>(fn: () => Promise<T>): Promise<T> {
		const run = async (): Promise<T> => {
			const wait = last + minIntervalMs - Date.now();
			if (wait > 0) await new Promise((r) => setTimeout(r, wait));
			last = Date.now();
			return fn();
		};
		const result = chain.then(run, run);
		chain = result.then(
			() => {},
			() => {}
		);
		return result;
	};
}

// Simple concurrency limiter so we don't fan out hundreds of requests at once.
export function createLimiter(max: number) {
	let active = 0;
	const queue: (() => void)[] = [];
	const next = () => {
		if (active >= max || queue.length === 0) return;
		active++;
		const run = queue.shift()!;
		run();
	};
	return function limit<T>(fn: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			queue.push(() => {
				fn()
					.then(resolve, reject)
					.finally(() => {
						active--;
						next();
					});
			});
			next();
		});
	};
}
