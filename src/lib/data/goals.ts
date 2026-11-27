// Goal-first design: a "goal" is a product intent expressed as a curated bundle of
// protein targets (by UniProt accession) plus the mechanism narrative and claim
// class. The engine resolves each accession to its ChEMBL target live, then measures
// which of a plant's actives engage them — the directed query that generic
// potency-ranking misses. Curated biology; every target is citable.

export type GoalTarget = {
	acc: string; // UniProt accession — the stable join key across ChEMBL/UniProt/Open Targets
	gene: string;
	role: string; // what this target does in the goal's mechanism
	evidence: 'binding' | 'regulatory'; // binding => measurable in ChEMBL; regulatory => literature-level
	why: string; // why engaging it advances the goal
};

export type MoaLayer = { step: string; mechanism: string; via: string[] /* genes */ };

export type Goal = {
	id: string;
	label: string;
	claimClass: 'cosmetic' | 'nutraceutical';
	route: 'topical' | 'oral';
	summary: string;
	intent: string; // the one-line product intent
	targets: GoalTarget[];
	moa: MoaLayer[];
	litTerms: string[]; // PubMed corroboration terms (compound AND <term>)
	caveats: string[];
};

export const GOALS: Goal[] = [
	{
		id: 'de-tan',
		label: 'De-Tan / Skin Brightening',
		claimClass: 'cosmetic',
		route: 'topical',
		intent: 'Reduce UV-induced tanning and even skin tone by suppressing melanin synthesis.',
		summary:
			'Tanning is melanin made by melanocytes under UV. A de-tan active must stop new melanin at its rate-limiting enzyme, down-regulate the melanogenic programme, and remove the UV/inflammatory triggers that switch it on.',
		targets: [
			{ acc: 'P14679', gene: 'TYR', role: 'Rate-limiting enzyme of melanogenesis (tyrosine → melanin)', evidence: 'binding', why: 'Direct inhibition means less melanin is synthesised — the core de-tan mechanism.' },
			{ acc: 'P35354', gene: 'PTGS2', role: 'COX-2; drives UV inflammation and post-inflammatory hyperpigmentation', evidence: 'binding', why: 'Blocking it prevents the inflammatory darkening that follows sun exposure.' },
			{ acc: 'O75030', gene: 'MITF', role: 'Master transcription factor for TYR/TYRP1/DCT expression', evidence: 'regulatory', why: 'Down-regulation lowers the whole melanogenic enzyme set upstream.' }
		],
		moa: [
			{ step: 'Inhibit melanin synthesis', mechanism: 'Competitive/mixed inhibition of tyrosinase', via: ['TYR'] },
			{ step: 'Down-regulate the machinery', mechanism: 'Lower MITF → less TYR/TYRP1/DCT expressed', via: ['MITF'] },
			{ step: 'Remove inflammatory trigger', mechanism: 'COX-2 inhibition reduces post-inflammatory hyperpigmentation', via: ['PTGS2'] }
		],
		litTerms: ['tyrosinase', 'melanogenesis', 'hyperpigmentation'],
		caveats: [
			'Cosmetic claims only (brightening / even-tone appearance) — not a drug claim to treat melasma.',
			'Potency is moderate; the edge is multi-mechanism + topical delivery, not raw IC50.'
		]
	},
	{
		id: 'anti-inflammatory',
		label: 'Anti-Inflammatory',
		claimClass: 'nutraceutical',
		route: 'oral',
		intent: 'Dampen the eicosanoid and nitric-oxide arms of the inflammatory response.',
		summary:
			'Inflammation is driven by prostaglandin, leukotriene and nitric-oxide synthesis. A botanical anti-inflammatory should hit more than one enzyme in these arms — the polypharmacology that distinguishes a plant mixture from a single NSAID.',
		targets: [
			{ acc: 'P35354', gene: 'PTGS2', role: 'COX-2 — prostaglandin synthesis', evidence: 'binding', why: 'The classic anti-inflammatory enzyme; prostaglandins drive pain/swelling.' },
			{ acc: 'P09917', gene: 'ALOX5', role: '5-lipoxygenase — leukotriene synthesis', evidence: 'binding', why: 'Covers the leukotriene arm that COX inhibitors miss.' },
			{ acc: 'P35228', gene: 'NOS2', role: 'Inducible nitric-oxide synthase', evidence: 'binding', why: 'iNOS-derived NO amplifies inflammation; inhibiting it is complementary.' }
		],
		moa: [
			{ step: 'Block prostaglandins', mechanism: 'COX-2 inhibition', via: ['PTGS2'] },
			{ step: 'Block leukotrienes', mechanism: '5-LOX inhibition', via: ['ALOX5'] },
			{ step: 'Lower nitric oxide', mechanism: 'iNOS suppression', via: ['NOS2'] }
		],
		litTerms: ['anti-inflammatory', 'COX-2', 'inflammation'],
		caveats: ['Nutraceutical support claim — not a substitute for NSAID therapy where indicated.']
	},
	{
		id: 'glycemic',
		label: 'Glycemic Support',
		claimClass: 'nutraceutical',
		route: 'oral',
		intent: 'Support healthy post-meal glucose by acting on complementary metabolic targets.',
		summary:
			'Post-meal glucose is shaped by incretin breakdown, the polyol pathway and insulin sensitivity. Hitting several of these at once is the rationale for a multi-constituent botanical over a single-target drug.',
		targets: [
			{ acc: 'P27487', gene: 'DPP4', role: 'Dipeptidyl peptidase-4 — degrades incretins (GLP-1)', evidence: 'binding', why: 'Inhibition prolongs incretin action → better glucose-dependent insulin release.' },
			{ acc: 'P15121', gene: 'AKR1B1', role: 'Aldose reductase — polyol pathway', evidence: 'binding', why: 'Inhibition limits sorbitol accumulation linked to diabetic complications.' },
			{ acc: 'P37231', gene: 'PPARG', role: 'PPAR-γ — insulin sensitisation', evidence: 'binding', why: 'Partial agonism improves insulin sensitivity without full-agonist liabilities.' }
		],
		moa: [
			{ step: 'Prolong incretins', mechanism: 'DPP-4 inhibition', via: ['DPP4'] },
			{ step: 'Limit polyol flux', mechanism: 'Aldose-reductase inhibition', via: ['AKR1B1'] },
			{ step: 'Sensitise to insulin', mechanism: 'PPAR-γ partial agonism', via: ['PPARG'] }
		],
		litTerms: ['antidiabetic', 'alpha-glucosidase', 'insulin'],
		caveats: ['Nutraceutical support claim — not a treatment for diabetes; not a substitute for prescribed therapy.']
	}
];

export function getGoal(id: string): Goal | undefined {
	return GOALS.find((g) => g.id === id);
}

export const GOAL_INDEX = GOALS.map((g) => ({ id: g.id, label: g.label, claimClass: g.claimClass, route: g.route, intent: g.intent }));
