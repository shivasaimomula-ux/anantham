// ChEMBL — CC BY-SA 3.0. Compound → protein-target links.
// Targets come from (a) curated mechanisms of action and (b) measured
// bioactivities; a 0–1 confidence is derived from pChEMBL potency.
import { getJSON } from '../http';
import { cached } from '../cache';

const BASE = 'https://www.ebi.ac.uk/chembl/api/data';

export type ChemblTarget = {
	targetChemblId: string;
	accession: string | null;
	prefName: string;
	score: number; // 0..1 confidence
	evidence: 'mechanism' | 'bioactivity';
	mechanism?: string;
	nActivities?: number;
	maxPchembl?: number;
};

export type ChemblResult = { chemblId: string | null; targets: ChemblTarget[] };

// pChEMBL ~ -log10(IC50/Ki in M). 6 ≈ 1µM, 7 ≈ 100nM, 9 ≈ 1nM.
// Map to a readable 0..1 confidence.
function pchemblToScore(p: number): number {
	return Math.max(0, Math.min(1, (p - 4) / 6));
}

async function resolveChemblId(inchikey: string | null, name: string): Promise<string | null> {
	if (inchikey) {
		try {
			const r = await getJSON<{ molecules?: { molecule_chembl_id: string }[] }>(
				`${BASE}/molecule.json?molecule_structures__standard_inchi_key=${inchikey}&limit=1`
			);
			if (r.molecules?.[0]) return r.molecules[0].molecule_chembl_id;
		} catch {
			/* fall through to name */
		}
	}
	try {
		const r = await getJSON<{ molecules?: { molecule_chembl_id: string }[] }>(
			`${BASE}/molecule/search.json?q=${encodeURIComponent(name)}&limit=1`
		);
		return r.molecules?.[0]?.molecule_chembl_id ?? null;
	} catch {
		return null;
	}
}

type TargetDetail = {
	pref_name?: string;
	organism?: string;
	target_type?: string;
	target_components?: { accession?: string }[];
};

async function targetDetail(tid: string): Promise<{ accession: string | null; prefName: string; human: boolean }> {
	return cached(`chembl:target:${tid}`, 7 * 24 * 3600_000, async () => {
		try {
			const d = await getJSON<TargetDetail>(`${BASE}/target/${tid}.json`);
			const accession = d.target_components?.find((c) => c.accession)?.accession ?? null;
			return {
				accession,
				prefName: d.pref_name ?? tid,
				human: (d.organism ?? '').toLowerCase() === 'homo sapiens'
			};
		} catch {
			return { accession: null, prefName: tid, human: false };
		}
	});
}

export function getTargets(inchikey: string | null, name: string, topN = 4): Promise<ChemblResult> {
	const key = `chembl:targets:${inchikey ?? name.toLowerCase()}:${topN}`;
	return cached(key, 3 * 24 * 3600_000, async () => {
		{
			const chemblId = await resolveChemblId(inchikey, name);
			if (!chemblId) return { chemblId: null, targets: [] };

			const byTarget = new Map<string, ChemblTarget>();

			// (a) curated mechanisms
			try {
				const m = await getJSON<{
					mechanisms?: { target_chembl_id?: string; mechanism_of_action?: string }[];
				}>(`${BASE}/mechanism.json?molecule_chembl_id=${chemblId}&limit=20`);
				for (const mech of m.mechanisms ?? []) {
					if (!mech.target_chembl_id) continue;
					byTarget.set(mech.target_chembl_id, {
						targetChemblId: mech.target_chembl_id,
						accession: null,
						prefName: mech.target_chembl_id,
						score: 0.95,
						evidence: 'mechanism',
						mechanism: mech.mechanism_of_action
					});
				}
			} catch {
				/* ignore */
			}

			// (b) measured bioactivities (human), aggregated by target
			try {
				const a = await getJSON<{
					activities?: { target_chembl_id?: string; pchembl_value?: string | number }[];
				}>(
					`${BASE}/activity.json?molecule_chembl_id=${chemblId}&pchembl_value__isnull=false&target_organism=Homo%20sapiens&limit=300&only=target_chembl_id,pchembl_value`
				);
				const agg = new Map<string, { max: number; n: number }>();
				for (const act of a.activities ?? []) {
					const tid = act.target_chembl_id;
					const pv = act.pchembl_value == null ? NaN : Number(act.pchembl_value);
					if (!tid || Number.isNaN(pv)) continue;
					const cur = agg.get(tid) ?? { max: 0, n: 0 };
					cur.max = Math.max(cur.max, pv);
					cur.n += 1;
					agg.set(tid, cur);
				}
				for (const [tid, v] of agg) {
					if (byTarget.has(tid)) {
						const t = byTarget.get(tid)!;
						t.nActivities = v.n;
						t.maxPchembl = v.max;
						continue;
					}
					byTarget.set(tid, {
						targetChemblId: tid,
						accession: null,
						prefName: tid,
						score: pchemblToScore(v.max),
						evidence: 'bioactivity',
						nActivities: v.n,
						maxPchembl: v.max
					});
				}
			} catch {
				/* ignore */
			}

			// Rank, keep topN, then resolve human protein identity for those.
			const ranked = [...byTarget.values()].sort((x, y) => y.score - x.score).slice(0, topN + 2);
			const resolved: ChemblTarget[] = [];
			await Promise.all(
				ranked.map(async (t) => {
					const d = await targetDetail(t.targetChemblId);
					if (!d.human || !d.accession) return;
					t.accession = d.accession;
					t.prefName = d.prefName;
					resolved.push(t);
				})
			);
			resolved.sort((x, y) => y.score - x.score);
			return { chemblId, targets: resolved.slice(0, topN) };
		}
	});
}
