// Resolve a slug to a Plant descriptor. Seeded catalogue first (curated traditions
// + known actives); otherwise treat the slug as a scientific name and build the
// descriptor LIVE from LOTUS (Wikidata) — this is what scales the platform from 6
// plants to anything in LOTUS.
import { getPlant, type Plant } from '#lib/data/plants';
import { cached } from './cache';
import { lotusOccurrences, resolveTaxon } from './sources/lotus';

/** "azadirachta-indica" -> "Azadirachta indica" (genus capitalised, rest lower). */
export function slugToScientific(slug: string): string {
	const words = slug.split('-').filter(Boolean);
	if (!words.length) return '';
	return [words[0][0].toUpperCase() + words[0].slice(1), ...words.slice(1)].join(' ');
}

export function slugify(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

export function resolvePlant(slug: string): Promise<Plant | null> {
	const seeded = getPlant(slug);
	if (seeded) return Promise.resolve(seeded);

	return cached(`resolve:${slug}`, 24 * 3600_000, async () => {
		const scientific = slugToScientific(slug);
		if (!scientific.includes(' ')) return null; // need a binomial
		const [taxon, occ] = await Promise.all([resolveTaxon(scientific), lotusOccurrences(scientific, 8)]);
		if (!taxon || occ.length === 0) return null; // unknown or no LOTUS occurrences

		return {
			slug,
			common: taxon.common ?? scientific,
			scientific,
			family: taxon.family ?? '—',
			taxon: { rank: 'species', wikidata: taxon.wikidata ?? undefined, ncbi: taxon.ncbi ?? undefined },
			blurb: `Profiled live from LOTUS occurrence data and open chemical databases — ${occ.length} characteristic constituents.`,
			traditions: [], // no curated ethnobotany for on-demand species (Phase 3)
			compounds: occ.map((o) => ({ name: o.name, cid: o.cid }))
		} satisfies Plant;
	});
}
