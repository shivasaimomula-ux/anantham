// Resilient JSON/text fetch helper: timeout + limited retries with backoff,
// plus a single global concurrency cap so fan-out stays polite. All external
// database calls go through here.
import { createLimiter } from './cache';

// One shared cap for every outbound request. Flat (not nested) so it can never
// deadlock the way a per-module limiter wrapping nested calls would.
const globalLimit = createLimiter(8);

export class HttpError extends Error {
	constructor(
		public status: number,
		public url: string,
		message?: string
	) {
		super(message ?? `HTTP ${status} for ${url}`);
	}
}

type FetchOpts = {
	timeoutMs?: number;
	retries?: number;
	headers?: Record<string, string>;
	method?: string;
	body?: string;
	accept?: string;
};

const UA = 'Herbenzo/1.0 (open medicinal-plant informatics)';

async function doFetch(url: string, opts: FetchOpts): Promise<Response> {
	const { timeoutMs = 20000, headers = {}, method = 'GET', body, accept } = opts;
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		return await fetch(url, {
			method,
			body,
			signal: ctrl.signal,
			headers: {
				'User-Agent': UA,
				...(accept ? { Accept: accept } : {}),
				...headers
			}
		});
	} finally {
		clearTimeout(t);
	}
}

async function withRetry<T>(url: string, opts: FetchOpts, parse: (r: Response) => Promise<T>): Promise<T> {
	const retries = opts.retries ?? 2;
	let lastErr: unknown;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const res = await globalLimit(() => doFetch(url, opts));
			// Retry on transient server/rate errors.
			if (res.status === 429 || res.status >= 500) {
				throw new HttpError(res.status, url);
			}
			if (!res.ok) throw new HttpError(res.status, url);
			return await parse(res);
		} catch (err) {
			lastErr = err;
			if (attempt < retries) {
				await new Promise((r) => setTimeout(r, 400 * (attempt + 1) + Math.random() * 200));
			}
		}
	}
	throw lastErr;
}

export function getJSON<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
	return withRetry(url, { accept: 'application/json', ...opts }, (r) => r.json() as Promise<T>);
}

export function postJSON<T = unknown>(url: string, payload: unknown, opts: FetchOpts = {}): Promise<T> {
	return withRetry(
		url,
		{
			...opts,
			method: 'POST',
			body: JSON.stringify(payload),
			headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
			accept: 'application/json'
		},
		(r) => r.json() as Promise<T>
	);
}

export function getText(url: string, opts: FetchOpts = {}): Promise<string> {
	return withRetry(url, opts, (r) => r.text());
}
