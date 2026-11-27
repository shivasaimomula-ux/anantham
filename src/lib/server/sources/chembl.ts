// ChEMBL — CC BY-SA 3.0. Compound → protein-target links.
// Targets come from (a) curated mechanisms of action and (b) measured
// bioactivities; a 0–1 confidence is derived from pChEMBL potency.
import { getJSON } from '../http';
import { cached } from '../cache';

const BASE = 'https://www.ebi.ac.uk/chembl/api/data';
// ChEMBL/EBI can be slow and flaky — fail a single call fast (the orchestrator's
// time budget returns partial results rather than letting one call hang).
const CHEMBL_OPTS = { timeoutMs: 13000, retries: 1 } as const;

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
				`${BASE}/molecule.json?molecule_structures__standard_inchi_key=${inchikey}&limit=1`,
				CHEMBL_OPTS
			);
			if (r.molecules?.[0]) return r.molecules[0].molecule_chembl_id;
		} catch {
			/* fall through to name */
		}
	}
	try {
		const r = await getJSON<{ molecules?: { molecule_chembl_id: string }[] }>(
			`${BASE}/molecule/search.json?q=${encodeURIComponent(name)}&limit=1`,
			CHEMBL_OPTS
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
			const d = await getJSON<TargetDetail>(`${BASE}/target/${tid}.json`, CHEMBL_OPTS);
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

// ── Target-directed query (goal-first): resolve a UniProt accession to its human
// ChEMBL target, then measure a specific compound against specific targets. This is
// what surfaces goal-relevant targets (e.g. tyrosinase) that generic top-N ranking
// drops because the compound is promiscuous.
export function targetIdForAccession(acc: string): Promise<string | null> {
	return cached(`chembl:acc2tid:${acc}`, 30 * 24 * 3600_000, async () => {
		try {
			const r = await getJSON<{ targets?: { target_chembl_id: string; target_type?: string }[] }>(
				`${BASE}/target.json?target_components__accession=${acc}&organism=Homo%20sapiens&limit=5`,
				CHEMBL_OPTS
			);
			// prefer a single-protein target
			const t = r.targets?.find((x) => x.target_type === 'SINGLE PROTEIN') ?? r.targets?.[0];
			return t?.target_chembl_id ?? null;
		} catch {
			return null;
		}
	});
}

export type DirectedHit = { acc: string; chemblTarget: string; pchembl: number; valueNm: number | null; type: string; n: number };

/** Measured activity of one compound against a specific set of UniProt targets. */
export function directedActivity(inchikey: string | null, name: string, accessions: string[]): Promise<Record<string, DirectedHit>> {
	const key = `chembl:directed:${inchikey ?? name.toLowerCase()}:${accessions.slice().sort().join(',')}`;
	return cached(key, 7 * 24 * 3600_000, async () => {
		const out: Record<string, DirectedHit> = {};
		const chemblId = await resolveChemblId(inchikey, name);
		if (!chemblId) return out;

		const tids = await Promise.all(accessions.map(async (acc) => ({ acc, tid: await targetIdForAccession(acc) })));
		const valid = tids.filter((x): x is { acc: string; tid: string } => !!x.tid);
		if (!valid.length) return out;
		const tidToAcc = new Map(valid.map((v) => [v.tid, v.acc]));

		let acts: { target_chembl_id?: string; pchembl_value?: string | number; standard_value?: string | number; standard_type?: string }[] = [];
		try {
			const r = await getJSON<{ activities?: typeof acts }>(
				`${BASE}/activity.json?molecule_chembl_id=${chemblId}&target_chembl_id__in=${valid.map((v) => v.tid).join(',')}&pchembl_value__isnull=false&limit=200&only=target_chembl_id,pchembl_value,standard_value,standard_type`,
				CHEMBL_OPTS
			);
			acts = r.activities ?? [];
		} catch {
			return out;
		}

		for (const a of acts) {
			const tid = a.target_chembl_id;
			const pv = a.pchembl_value == null ? NaN : Number(a.pchembl_value);
			if (!tid || Number.isNaN(pv)) continue;
			const acc = tidToAcc.get(tid);
			if (!acc) continue;
			const prev = out[acc];
			if (!prev || pv > prev.pchembl) {
				out[acc] = { acc, chemblTarget: tid, pchembl: pv, valueNm: a.standard_value == null ? null : Number(a.standard_value), type: a.standard_type ?? 'IC50', n: (prev?.n ?? 0) + 1 };
			} else {
				prev.n += 1;
			}
		}
		return out;
	});
}

export function getTargets(inchikey: string | null, name: string, topN = 4): Promise<ChemblResult> {
	const key = `chembl:targets:${inchikey ?? name.toLowerCase()}:${topN}`;
	return cached(key, 3 * 24 * 3600_000, async () => {
		{
			const chemblId = await resolveChemblId(inchikey, name);
			if (!chemblId) return { chemblId: null, targets: [] };

			const byTarget = new Map<string, ChemblTarget>();

			// Fetch curated mechanisms and measured bioactivities IN PARALLEL — they
			// are independent, and ChEMBL latency dominates the whole pipeline.
			const [mRes, aRes] = await Promise.allSettled([
				getJSON<{ mechanisms?: { target_chembl_id?: string; mechanism_of_action?: string }[] }>(
					`${BASE}/mechanism.json?molecule_chembl_id=${chemblId}&limit=20`,
					CHEMBL_OPTS
				),
				getJSON<{ activities?: { target_chembl_id?: string; pchembl_value?: string | number }[] }>(
					`${BASE}/activity.json?molecule_chembl_id=${chemblId}&pchembl_value__isnull=false&target_organism=Homo%20sapiens&limit=150&only=target_chembl_id,pchembl_value`,
					CHEMBL_OPTS
				)
			]);

			// (a) curated mechanisms
			if (mRes.status === 'fulfilled') {
				for (const mech of mRes.value.mechanisms ?? []) {
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
			}

			// (b) measured bioactivities (human), aggregated by target
			if (aRes.status === 'fulfilled') {
				const a = aRes.value;
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
