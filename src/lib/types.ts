// Shared client-facing shapes (no server imports, safe to use in components).

export type DiseaseLink = { id: string; name: string; score: number };

export type CompoundTargetRef = {
	accession: string;
	score: number;
	evidence: string;
	mechanism?: string;
};

export type CompoundOut = {
	cid: number;
	name: string;
	formula: string | null;
	mw: number | null;
	xlogp: number | null;
	tpsa: number | null;
	inchikey: string | null;
	iupac: string | null;
	smiles: string | null;
	chemblId: string | null;
	literature: number;
	targets: CompoundTargetRef[];
};

export type TargetOut = {
	accession: string;
	prefName: string;
	gene: string | null;
	proteinName: string;
	ensembl: string | null;
	category: string | null;
	score: number;
	diseases: DiseaseLink[];
};

export type Edge = { compound: string; target: string; score: number; evidence: string };

export type Tradition = { system: string; uses: string[]; note?: string };

export type PlantProfile = {
	plant: {
		slug: string;
		common: string;
		scientific: string;
		family: string;
		blurb: string;
		taxon: { rank: string; wikidata?: string; ncbi?: number };
		traditions: Tradition[];
	};
	compounds: CompoundOut[];
	targets: TargetOut[];
	edges: Edge[];
	literature: { count: number; url: string };
	sources: string[];
	generatedAt: string;
};

// Client-side computed descriptors (RDKit) merged onto a compound for display.
export type Descriptors = {
	mw: number;
	alogp: number;
	hba: number;
	hbd: number;
	psa: number;
	rotb: number;
	arom: number;
	fractionCsp3: number;
	rings: number;
	heavy: number;
	atoms: number;
	mr: number;
	aromaticProportion: number;
	alerts: number;
	qed: number;
	lipinskiViolations: number;
	svg: string;
};

export type EnrichedCompound = CompoundOut & { desc?: Descriptors; qedClass?: string };
