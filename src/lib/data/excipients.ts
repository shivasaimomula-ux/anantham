// Functional-excipient knowledge base — the formulation engine's logic layer.
//
// There is no live API for "excipient X improves active Y", so this is a
// curated, mechanism-based knowledge base drawn from pharmaceutics literature
// and regulatory excipient references (FDA Inactive Ingredient Database, GRAS).
// It is the engine's IP, not demo data. Each excipient declares which
// developability DEFICIENCY it addresses; the engine matches it to the API's
// diagnosed problems and grounds the pairing in live PubMed evidence.

export type Deficiency = 'solubility' | 'permeability' | 'metabolism' | 'stability';

export type Excipient = {
	id: string;
	name: string;
	class: string;
	addresses: Deficiency[];
	mechanism: string;
	/** relative functional strength 0–1 (literature-informed, qualitative) */
	potency: number;
	regulatory: string;
	/** a real marketed product using this strategy, where one exists */
	precedent?: string;
};

export const EXCIPIENTS: Excipient[] = [
	{
		id: 'phospholipid',
		name: 'Phospholipid complex (phytosome)',
		class: 'Phospholipid',
		addresses: ['solubility', 'permeability'],
		mechanism: 'Forms a lipid-compatible complex with polyphenols, raising dissolution and membrane partitioning.',
		potency: 0.9,
		regulatory: 'GRAS (lecithin)',
		precedent: 'Meriva® — curcumin phytosome (~29× bioavailability)'
	},
	{
		id: 'hpbcd',
		name: 'Hydroxypropyl-β-cyclodextrin',
		class: 'Cyclodextrin',
		addresses: ['solubility', 'stability'],
		mechanism: 'Forms an inclusion complex that solubilises lipophilic actives and shields labile groups.',
		potency: 0.7,
		regulatory: 'FDA IID (multiple routes, incl. topical) · cosmetic ingredient',
		precedent: 'Widely used solubiliser (e.g. itraconazole); topical/cosmetic use established'
	},
	{
		id: 'sedds',
		name: 'Self-emulsifying lipid (SEDDS)',
		class: 'Lipid system',
		addresses: ['solubility', 'permeability'],
		mechanism: 'Presents the active pre-dissolved in fine oil droplets; promotes lymphatic uptake, bypassing first-pass.',
		potency: 0.85,
		regulatory: 'GRAS lipids',
		precedent: 'Neoral® (cyclosporine SEDDS)'
	},
	{
		id: 'solid-dispersion',
		name: 'Amorphous solid dispersion (PVP)',
		class: 'Polymer carrier',
		addresses: ['solubility'],
		mechanism: 'Traps the active in an amorphous, rapidly dissolving polymer matrix.',
		potency: 0.65,
		regulatory: 'FDA IID (povidone)',
		precedent: 'Kaletra® (lopinavir ASD)'
	},
	{
		id: 'tpgs',
		name: 'Vitamin E TPGS',
		class: 'Surfactant',
		addresses: ['solubility', 'permeability'],
		mechanism: 'Non-ionic surfactant that solubilises and inhibits P-glycoprotein efflux.',
		potency: 0.75,
		regulatory: 'FDA IID',
		precedent: undefined
	},
	{
		id: 'piperine',
		name: 'Piperine (BioPerine®)',
		class: 'Bioenhancer',
		addresses: ['metabolism', 'permeability'],
		mechanism: 'Inhibits intestinal UGT glucuronidation and P-gp efflux, cutting first-pass loss.',
		potency: 0.9,
		regulatory: 'Food / GRAS',
		precedent: 'Curcumin + piperine (~20× bioavailability)'
	},
	{
		id: 'labrasol',
		name: 'Labrasol (caprylocaproyl macrogolglycerides)',
		class: 'Permeation enhancer',
		addresses: ['permeability', 'solubility'],
		mechanism: 'Surfactant that fluidises enterocyte membranes and solubilises the active.',
		potency: 0.7,
		regulatory: 'FDA IID (oral)',
		precedent: undefined
	},
	{
		id: 'chitosan',
		name: 'Chitosan',
		class: 'Mucoadhesive',
		addresses: ['permeability'],
		mechanism: 'Opens epithelial tight junctions and prolongs mucosal contact time.',
		potency: 0.6,
		regulatory: 'GRAS',
		precedent: undefined
	},
	{
		id: 'quercetin',
		name: 'Quercetin (co-active)',
		class: 'Metabolic modulator',
		addresses: ['metabolism'],
		mechanism: 'Competes for UGT/SULT conjugation, sparing the primary active from first-pass metabolism.',
		potency: 0.55,
		regulatory: 'Food / GRAS',
		precedent: undefined
	},
	{
		id: 'tocopherol',
		name: 'α-Tocopherol (antioxidant)',
		class: 'Stabiliser',
		addresses: ['stability'],
		mechanism: 'Scavenges radicals that drive oxidative degradation of the active.',
		potency: 0.6,
		regulatory: 'GRAS',
		precedent: undefined
	},
	{
		id: 'ph-buffer',
		name: 'pH / citrate buffer',
		class: 'Stabiliser',
		addresses: ['stability'],
		mechanism: 'Holds a pH where the active resists hydrolytic degradation (e.g. curcumin is stable at acidic ~pH 5 and degrades rapidly above neutral).',
		potency: 0.5,
		regulatory: 'GRAS',
		precedent: undefined
	},
	{
		id: 'liposome',
		name: 'Liposomal encapsulation',
		class: 'Nanocarrier',
		addresses: ['stability', 'solubility', 'permeability'],
		mechanism: 'Encloses the active in a phospholipid bilayer — physical protection plus improved uptake.',
		potency: 0.8,
		regulatory: 'GRAS lipids',
		precedent: 'Liposomal curcumin / vitamin C'
	}
];

// FDA inactive-ingredient names for live openFDA usage lookup. Only molecular
// excipients that appear in the IID have an entry; delivery *systems*
// (phytosome, SEDDS, liposome) are formulation strategies, not single
// ingredients, so they map to null and are shown as strategies instead.
export const FDA_TERMS: Record<string, string | null> = {
	phospholipid: 'lecithin',
	hpbcd: 'hydroxypropyl betadex',
	sedds: null,
	'solid-dispersion': 'povidone',
	tpgs: 'tocophersolan',
	piperine: 'piperine',
	labrasol: null,
	chitosan: 'chitosan',
	quercetin: null,
	tocopherol: 'tocopherol',
	'ph-buffer': 'citric acid',
	liposome: null
};

// Clean terms for live PubMed co-mention evidence (active + excipient).
export const EVIDENCE_TERMS: Record<string, string> = {
	phospholipid: 'phytosome',
	hpbcd: 'cyclodextrin',
	sedds: 'self-emulsifying',
	'solid-dispersion': 'solid dispersion',
	tpgs: 'TPGS',
	piperine: 'piperine',
	labrasol: 'Labrasol',
	chitosan: 'chitosan',
	quercetin: 'quercetin',
	tocopherol: 'tocopherol',
	'ph-buffer': 'stability',
	liposome: 'liposomal'
};

export const DEFICIENCY_LABEL: Record<Deficiency, string> = {
	solubility: 'Low solubility',
	permeability: 'Low permeability',
	metabolism: 'First-pass metabolism',
	stability: 'Chemical instability'
};
