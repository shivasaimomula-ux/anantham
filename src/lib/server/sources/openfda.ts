// openFDA drug-label API — live regulatory precedent for an excipient:
// how many FDA-approved drug products list it as an inactive ingredient.
// (This is openFDA SPL labeling, which overlaps with — but is not identical to —
// the formal Inactive Ingredient Database max-potency limits.)
import { getJSON } from '../http';
import { cached } from '../cache';

const BASE = 'https://api.fda.gov/drug/label.json';

export function ingredientUsage(term: string): Promise<number | null> {
	return cached(`openfda:ii:${term.toLowerCase()}`, 7 * 24 * 3600_000, async () => {
		try {
			const url = `${BASE}?search=inactive_ingredient:%22${encodeURIComponent(term)}%22&limit=1`;
			const d = await getJSON<{ meta?: { results?: { total?: number } } }>(url);
			return d.meta?.results?.total ?? 0;
		} catch {
			return null; // 404 = none found / not resolvable
		}
	});
}
