// Secondary-metabolite filter for LOTUS occurrences.
//
// A raw Wikidata P703 ("found in taxon") query returns whatever is recorded —
// which for well-studied plants is dominated by UBIQUITOUS PRIMARY METABOLITES
// (sterols, fatty acids, n-alkanes, sugars, common organic acids). Those are not
// what makes a plant pharmacologically interesting. This module removes them so
// the characteristic secondary metabolites surface.
//
// This is a pragmatic denylist. The principled upgrade (documented in the ML
// blueprint) is to classify every compound with NPClassifier / ClassyFire and keep
// only true secondary-metabolite pathways — wire that in via NP_CLASSIFIER_URL.

// Greek letters spelled out so "β-sitosterol" and "beta-sitosterol" normalise alike.
const GREEK: Record<string, string> = { 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ω': 'omega' };

// Leading stereochemical / positional descriptors stripped before denylist matching,
// so "alpha-", "β-", "(−)-", "para-", "n-" etc. don't hide a known primary.
const LEAD_PREFIX =
	/^(?:alpha|beta|gamma|delta|omega|ortho|meta|para|sec|tert|iso|neo|cis|trans|endo|exo|syn|anti|rac|epi|n|o|m|p|e|z|d|l|dl|r|s|rs)-/i;

function norm(s: string): string {
	let v = s.toLowerCase().trim();
	v = v.replace(/[αβγδω]/g, (c) => GREEK[c] ?? c); // greek symbol → word
	// Peel leading descriptors repeatedly: "(−)-alpha-2,3-…" → "…".
	let prev: string;
	do {
		prev = v;
		v = v
			.replace(/^\(([^)]*)\)-?/, '') // (E,E)-, (−)-, (R)-
			.replace(/^[\d,]+[a-z]?-/, '') // locants 2,3-
			.replace(LEAD_PREFIX, '')
			.trim();
	} while (v !== prev && v.length > 0);
	return v;
}

// Explicit ubiquitous primaries, by normalised common name.
const PRIMARY_NAMES = new Set(
	[
		// sterols / phytosterols
		'cholesterol', 'sitosterol', 'beta-sitosterol', 'stigmasterol', 'campesterol', 'brassicasterol',
		'ergosterol', 'sitogluside', 'daucosterol', 'sitosterol glucoside', 'stigmasterol glucoside',
		// fatty acids + esters + alcohols
		'palmitic acid', 'stearic acid', 'oleic acid', 'linoleic acid', 'linolenic acid', 'myristic acid',
		'lauric acid', 'arachidic acid', 'behenic acid', 'margaric acid', 'pentadecanoic acid',
		'methyl palmitate', 'methyl stearate', 'methyl oleate', 'methyl linoleate', 'ethyl palmitate',
		'glycerol monostearate', 'lauryl alcohol', 'cetyl alcohol', 'stearyl alcohol', 'palmitoleic acid',
		// sugars / polyols
		'glucose', 'd-glucose', 'fructose', 'sucrose', 'maltose', 'galactose', 'mannose', 'xylose',
		'arabinose', 'rhamnose', 'ribose', 'glycerol', 'sorbitol', 'mannitol', 'myo-inositol', 'inositol',
		'erythritol', 'xylitol',
		// common organic acids / primaries
		'citric acid', 'malic acid', 'succinic acid', 'fumaric acid', 'oxalic acid', 'tartaric acid',
		'lactic acid', 'pyruvic acid', 'malonic acid', 'glycolic acid', 'acetic acid', 'formic acid',
		// ubiquitous small molecules
		'phenol', 'adenosine', 'adenine', 'guanosine', 'uracil', 'uridine', 'cytosine', 'thymine',
		'glycerophosphocholine', 'choline', 'betaine', 'trigonelline', 'ascorbic acid', 'vitamin c',
		'glutamic acid', 'aspartic acid', 'alanine', 'proline', 'serine', 'glycine', 'valine', 'leucine',
		'phenylethyl alcohol', 'squalene', 'phytol', 'tocopherol', 'alpha-tocopherol', 'water',
		'glycerophosphoethanolamine', 'allantoin',
		// ubiquitous photosynthetic pigments / carotenoids (leaf background, not a
		// species signature — lycopene is deliberately NOT here, it IS characteristic)
		'carotene', 'beta-carotene', 'alpha-carotene', 'lutein', 'zeaxanthin',
		'violaxanthin', 'neoxanthin', 'chlorophyll', 'chlorophyll a', 'chlorophyll b',
		'pheophytin', 'beta-carotene',
		// cresols / ubiquitous simple phenolics
		'cresol', 'o-cresol', 'm-cresol', 'p-cresol', 'hydroquinone', 'catechol', 'guaiacol',
		// further primaries seen as LOTUS background noise
		'threonine', 'isoleucine', 'lysine', 'arginine', 'histidine', 'methionine', 'tyrosine',
		'tryptophan', 'cysteine', 'asparagine', 'glutamine', 'threitol', 'gluconic acid',
		'quinic acid', 'shikimic acid', 'galacturonic acid', 'glucuronic acid', 'trehalose',
		'raffinose', 'stachyose', 'maltotriose', 'cellobiose'
	].map(norm)
);

// Regex catches for homologous series the denylist can't enumerate.
const ALKANE = /^(?:n-)?(?:hen|do|tri|tetra|penta|hexa|hepta|octa|nona)?(?:dec|cos|triacont|tetracont)ane$/;
const SIMPLE_ACID = /^(?:[a-z]+)?(?:dec|cos|decan|octadec|hexadec|tetradec|dodec)anoic acid$/;

/** True if a compound is a ubiquitous primary metabolite (should be filtered out). */
export function isUbiquitousPrimary(name: string): boolean {
	const n = norm(name);
	if (PRIMARY_NAMES.has(n)) return true;
	if (ALKANE.test(n) || SIMPLE_ACID.test(n)) return true;
	// bare n-alkane / fatty-alcohol tails that slipped through
	if (/\b\w+(cosane|triacontane|acontane)\b/.test(n)) return true;
	return false;
}

/** The connectivity block of an InChIKey (merges salts/stereoisomers/charge forms). */
export function inchiSkeleton(inchikey?: string): string | null {
	if (!inchikey) return null;
	const block = inchikey.split('-')[0];
	return block && block.length >= 14 ? block : inchikey;
}
