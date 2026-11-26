// PubChem PUG REST — public domain. Compound identity, physicochemical
// properties, and 3D structures.
import { getJSON, getText } from '../http';
import { cached } from '../cache';

const BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
const PROPS = 'MolecularFormula,MolecularWeight,XLogP,TPSA,InChIKey,IUPACName,SMILES,ConnectivitySMILES';

export type PubChemCompound = {
	cid: number;
	name: string;
	formula: string | null;
	mw: number | null;
	xlogp: number | null;
	tpsa: number | null;
	inchikey: string | null;
	iupac: string | null;
	smiles: string | null;
};

type RawProp = {
	CID: number;
	MolecularFormula?: string;
	MolecularWeight?: string | number;
	XLogP?: number;
	TPSA?: number | string;
	InChIKey?: string;
	IUPACName?: string;
	SMILES?: string;
	ConnectivitySMILES?: string;
};

function toCompound(name: string, p: RawProp): PubChemCompound {
	const num = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v));
	return {
		cid: p.CID,
		name,
		formula: p.MolecularFormula ?? null,
		mw: num(p.MolecularWeight),
		xlogp: p.XLogP ?? null,
		tpsa: num(p.TPSA),
		inchikey: p.InChIKey ?? null,
		iupac: p.IUPACName ?? null,
		smiles: p.SMILES ?? p.ConnectivitySMILES ?? null
	};
}

export function getCompound(c: { name: string; cid?: number }): Promise<PubChemCompound | null> {
	const key = c.cid ? `pc:cid:${c.cid}` : `pc:name:${c.name.toLowerCase()}`;
	return cached(key, 7 * 24 * 3600_000, async () => {
		const locator = c.cid
			? `${BASE}/compound/cid/${c.cid}/property/${PROPS}/JSON`
			: `${BASE}/compound/name/${encodeURIComponent(c.name)}/property/${PROPS}/JSON`;
		// NOTE: a transient failure must THROW (not return null) so it is never
		// cached — otherwise a busy upstream poisons the cache for hours.
		const data = await getJSON<{ PropertyTable?: { Properties?: RawProp[] }; Fault?: { Code?: string } }>(locator);
		if (data.Fault) throw new Error(`PubChem ${data.Fault.Code ?? 'Fault'}`); // e.g. PUGREST.ServerBusy
		const row = data.PropertyTable?.Properties?.[0];
		if (!row) return null; // genuine "not found" — safe to cache
		return toCompound(c.name, row);
	});
}

/** 3D SDF (falls back to 2D) for a CID, for in-browser structure rendering. */
export function getSDF(cid: number): Promise<string | null> {
	return cached(`pc:sdf:${cid}`, 7 * 24 * 3600_000, async () => {
		for (const type of ['3d', '2d']) {
			try {
				const sdf = await getText(`${BASE}/compound/cid/${cid}/record/SDF?record_type=${type}`, {
					retries: 1
				});
				if (sdf && sdf.includes('$$$$')) return sdf;
			} catch {
				/* try next */
			}
		}
		return null;
	});
}
