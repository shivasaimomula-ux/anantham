// Plant catalogue — the cached "LOTUS layer".
//
// Plant -> compound occurrences are seeded here from LOTUS (naturalproducts.net,
// CC0) plus well-established phytochemistry. Everything downstream of a compound
// (physchem properties, protein targets, disease links, literature, structures)
// is fetched LIVE from open APIs at request time — nothing below the compound
// name is hard-coded.
//
// Traditional-use entries are curated ethnobotanical summaries (not from the live
// chemical APIs) and are intentionally high level.

export type Tradition = {
	system: 'Ayurveda' | 'TCM' | 'Western' | 'Unani' | 'Siddha';
	uses: string[];
	note?: string;
};

export type CatalogCompound = {
	name: string;
	/** Optional PubChem CID hint; when absent the name is resolved live. */
	cid?: number;
};

export type Plant = {
	slug: string;
	common: string;
	scientific: string;
	family: string;
	/** Short provenance for the taxon (used for display + future live LOTUS). */
	taxon: { rank: string; wikidata?: string; ncbi?: number };
	blurb: string;
	traditions: Tradition[];
	compounds: CatalogCompound[];
};

export const PLANTS: Plant[] = [
	{
		slug: 'turmeric',
		common: 'Turmeric',
		scientific: 'Curcuma longa',
		family: 'Zingiberaceae',
		taxon: { rank: 'species', ncbi: 136217 },
		blurb: 'A rhizomatous spice whose curcuminoids are among the most studied plant polyphenols.',
		traditions: [
			{ system: 'Ayurveda', uses: ['inflammation', 'skin disorders', 'digestive aid', 'wound healing'] },
			{ system: 'TCM', uses: ['blood stasis', 'pain relief', 'jaundice', 'menstrual disorders'] },
			{ system: 'Western', uses: ['anti-inflammatory', 'antioxidant', 'joint health', 'digestive support'] }
		],
		compounds: [
			{ name: 'curcumin', cid: 969516 },
			{ name: 'demethoxycurcumin', cid: 5469424 },
			{ name: 'bisdemethoxycurcumin', cid: 5315472 },
			{ name: 'ar-turmerone' }
		]
	},
	{
		slug: 'white-turmeric',
		common: 'White Turmeric (Kasturi Manjal)',
		scientific: 'Curcuma aromatica',
		family: 'Zingiberaceae',
		taxon: { rank: 'species', ncbi: 136220 },
		blurb: 'Aromatic "wild" turmeric valued as a non-staining, skin-brightening rhizome — curcuminoids layered over a rich sesquiterpene essential oil; the classic de-tan botanical of South-Asian skincare.',
		traditions: [
			{
				system: 'Ayurveda',
				uses: ['varnya (complexion)', 'skin brightening', 'blemishes & dark marks', 'ubtan skin pastes'],
				note: 'Vana Haridra / Aranya Haridra — the cosmetic turmeric'
			},
			{
				system: 'Siddha',
				uses: ['de-tanning face packs', 'facial radiance', 'even skin tone', 'bridal "Kasturi Manjal"'],
				note: 'Non-staining — unlike culinary C. longa'
			},
			{
				system: 'Western',
				uses: ['tyrosinase-inhibitory brightening', 'antioxidant topical', 'anti-inflammatory', 'photo-protection'],
				note: 'Cosmetic dermatology literature'
			}
		],
		compounds: [
			{ name: 'curcumin', cid: 969516 },
			{ name: 'demethoxycurcumin', cid: 5469424 },
			{ name: 'bisdemethoxycurcumin', cid: 5315472 },
			{ name: 'xanthorrhizol', cid: 93135 },
			{ name: 'germacrone', cid: 6436348 },
			{ name: 'curdione', cid: 14106072 }
		]
	},
	{
		slug: 'ashwagandha',
		common: 'Ashwagandha',
		scientific: 'Withania somnifera',
		family: 'Solanaceae',
		taxon: { rank: 'species', ncbi: 126910 },
		blurb: 'An adaptogenic nightshade; its withanolide steroidal lactones drive most pharmacology.',
		traditions: [
			{ system: 'Ayurveda', uses: ['adaptogen', 'vitality', 'stress relief', 'rejuvenation'] },
			{
				system: 'TCM',
				uses: ['calming shen', 'fatigue', 'insomnia'],
				note: 'Modern integrative use — not classical TCM'
			},
			{ system: 'Western', uses: ['stress reduction', 'cognitive function', 'athletic performance', 'sleep support'] }
		],
		compounds: [
			{ name: 'withaferin A', cid: 265237 },
			{ name: 'withanolide A', cid: 11294368 },
			{ name: 'withanone', cid: 21679027 }
		]
	},
	{
		slug: 'artemisia',
		common: 'Artemisia (Sweet Wormwood)',
		scientific: 'Artemisia annua',
		family: 'Asteraceae',
		taxon: { rank: 'species', ncbi: 35608 },
		blurb: 'Source of artemisinin, the sesquiterpene lactone that reshaped antimalarial therapy.',
		traditions: [
			{ system: 'Ayurveda', uses: ['fever', 'parasitic infections', 'immune support'] },
			{ system: 'TCM', uses: ['clearing heat', 'malaria', 'fever', 'summer heat'] },
			{ system: 'Western', uses: ['antimalarial', 'antimicrobial', 'fever reduction', 'digestive bitter'] }
		],
		compounds: [
			{ name: 'artemisinin', cid: 68827 },
			{ name: 'artesunate', cid: 6917864 },
			{ name: 'dihydroartemisinin', cid: 456410 }
		]
	},
	{
		slug: 'ginger',
		common: 'Ginger',
		scientific: 'Zingiber officinale',
		family: 'Zingiberaceae',
		taxon: { rank: 'species', ncbi: 94328 },
		blurb: 'Pungent rhizome whose gingerols and shogaols underlie its antiemetic and anti-inflammatory use.',
		traditions: [
			{ system: 'Ayurveda', uses: ['digestion', 'nausea', 'respiratory complaints', 'inflammation'] },
			{ system: 'TCM', uses: ['warming yang', 'nausea & vomiting', 'dispelling cold', 'cough'] },
			{ system: 'Western', uses: ['nausea relief', 'anti-inflammatory', 'digestive aid', 'antioxidant'] }
		],
		compounds: [
			{ name: '6-gingerol', cid: 442793 },
			{ name: '6-shogaol', cid: 5281794 },
			{ name: 'zingerone', cid: 31211 }
		]
	},
	{
		slug: 'holy-basil',
		common: 'Holy Basil (Tulsi)',
		scientific: 'Ocimum tenuiflorum',
		family: 'Lamiaceae',
		taxon: { rank: 'species', ncbi: 437466 },
		blurb: 'A sacred adaptogenic basil rich in eugenol and triterpene acids.',
		traditions: [
			{ system: 'Ayurveda', uses: ['adaptogen', 'respiratory health', 'fever', 'stress'] },
			{
				system: 'TCM',
				uses: ['clearing heat', 'qi regulation'],
				note: 'Modern integrative use — limited classical TCM record'
			},
			{ system: 'Western', uses: ['stress & adaptogen', 'immune support', 'antimicrobial', 'blood-sugar support'] }
		],
		compounds: [
			{ name: 'eugenol', cid: 3314 },
			{ name: 'ursolic acid', cid: 64945 },
			{ name: 'rosmarinic acid', cid: 5281792 }
		]
	}
];

export function getPlant(slug: string): Plant | undefined {
	return PLANTS.find((p) => p.slug === slug);
}

export const PLANT_INDEX = PLANTS.map(({ slug, common, scientific, family }) => ({
	slug,
	common,
	scientific,
	family
}));
