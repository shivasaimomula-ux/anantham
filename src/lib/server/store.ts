// The durable store: schema + normalized read/write for plant profiles.
//
// Writes come from the ingest layer (live fan-out, run offline). Reads reconstruct
// the exact PlantBase / PlantTargets payload shapes from normalized rows, with zero
// third-party calls — so the serving path is instant and outage-proof. Every row
// carries provenance (source + fetched_at).
import { db } from './db';
import type { PlantBase, PlantTargets, CompoundOut, TargetOut, CompoundTargetRef, Edge } from './orchestrate';

const SOURCES = ['LOTUS', 'PubChem', 'ChEMBL', 'UniProt', 'Open Targets', 'AlphaFold', 'PubMed'];

const SCHEMA = `
create table if not exists taxon (
  id serial primary key,
  slug text unique not null,
  scientific_name text not null,
  common_name text,
  family text,
  ncbi_taxid int,
  wikidata_qid text,
  rank text,
  blurb text
);
create table if not exists tradition (
  id serial primary key,
  taxon_id int references taxon(id) on delete cascade,
  ord int default 0,
  system text not null,
  uses text[] not null,
  note text
);
create table if not exists compound (
  id serial primary key,
  pubchem_cid bigint unique,
  inchikey text,
  chembl_id text,
  name text not null,
  smiles text,
  formula text,
  mw double precision,
  xlogp double precision,
  tpsa double precision,
  iupac text,
  source text default 'PubChem',
  fetched_at timestamptz default now()
);
create table if not exists occurrence (
  taxon_id int references taxon(id) on delete cascade,
  compound_id int references compound(id) on delete cascade,
  ord int default 0,
  literature int default 0,
  source text default 'LOTUS/curated',
  fetched_at timestamptz default now(),
  primary key (taxon_id, compound_id)
);
create table if not exists target (
  id serial primary key,
  uniprot_acc text unique not null,
  gene text,
  pref_name text,
  protein_name text,
  ensembl_gene text,
  category text,
  source text default 'UniProt',
  fetched_at timestamptz default now()
);
create table if not exists activity (
  compound_id int references compound(id) on delete cascade,
  target_id int references target(id) on delete cascade,
  score double precision,
  evidence text,
  mechanism text,
  source text default 'ChEMBL',
  fetched_at timestamptz default now(),
  primary key (compound_id, target_id)
);
create table if not exists disease (
  id serial primary key,
  efo_id text unique not null,
  name text
);
create table if not exists target_disease (
  target_id int references target(id) on delete cascade,
  disease_id int references disease(id) on delete cascade,
  score double precision,
  source text default 'Open Targets',
  primary key (target_id, disease_id)
);
create table if not exists plant_literature (
  taxon_id int references taxon(id) on delete cascade primary key,
  count int,
  url text,
  fetched_at timestamptz default now()
);
create table if not exists ingest_run (
  id serial primary key,
  slug text,
  status text,
  note text,
  targets int,
  started_at timestamptz default now(),
  finished_at timestamptz
);
`;

export async function migrate(): Promise<void> {
	const sql = db();
	if (!sql) throw new Error('no DATABASE_URL');
	await sql.unsafe(SCHEMA);
}

export async function hasPlant(slug: string): Promise<boolean> {
	const sql = db();
	if (!sql) return false;
	try {
		const r = await sql`select 1 from taxon where slug = ${slug} limit 1`;
		return r.length > 0;
	} catch {
		return false; // table may not exist yet
	}
}

// ── READ: reconstruct PlantBase ───────────────────────────────────────────────
export async function readBase(slug: string): Promise<(PlantBase & { provenance: Provenance }) | null> {
	const sql = db();
	if (!sql) return null;
	const trows = await sql`select * from taxon where slug = ${slug}`;
	if (!trows.length) return null;
	const t = trows[0];

	const trad = await sql`select system, uses, note from tradition where taxon_id = ${t.id} order by ord`;
	const comps = await sql`
		select c.*, o.literature, o.ord
		from compound c join occurrence o on o.compound_id = c.id
		where o.taxon_id = ${t.id} order by o.ord`;
	const litRow = await sql`select count, url, fetched_at from plant_literature where taxon_id = ${t.id}`;
	const lit = litRow[0] ?? { count: 0, url: '' };

	const compounds: CompoundOut[] = comps.map((c) => ({
		cid: Number(c.pubchem_cid),
		name: c.name,
		formula: c.formula ?? null,
		mw: c.mw ?? null,
		xlogp: c.xlogp ?? null,
		tpsa: c.tpsa ?? null,
		inchikey: c.inchikey ?? null,
		iupac: c.iupac ?? null,
		smiles: c.smiles ?? null,
		chemblId: c.chembl_id ?? null,
		literature: c.literature ?? 0,
		targets: []
	}));

	const fetched = newestFetched(comps.map((c) => c.fetched_at as Date).concat(lit.fetched_at as Date));
	return {
		plant: {
			slug: t.slug,
			common: t.common_name,
			scientific: t.scientific_name,
			family: t.family,
			blurb: t.blurb,
			taxon: { rank: t.rank, wikidata: t.wikidata_qid ?? undefined, ncbi: t.ncbi_taxid ?? undefined },
			traditions: trad.map((x) => ({ system: x.system, uses: x.uses, note: x.note ?? undefined }))
		},
		compounds,
		literature: { count: lit.count ?? 0, url: lit.url ?? '' },
		sources: SOURCES,
		generatedAt: new Date().toISOString(),
		provenance: { store: true, fetchedAt: fetched, datasets: SOURCES }
	};
}

// ── READ: reconstruct PlantTargets ────────────────────────────────────────────
export async function readTargets(slug: string): Promise<(PlantTargets & { provenance: Provenance }) | null> {
	const sql = db();
	if (!sql) return null;
	const trows = await sql`select id from taxon where slug = ${slug}`;
	if (!trows.length) return null;
	const taxonId = trows[0].id;

	// all (compound, target, activity) rows for this plant
	const rows = await sql`
		select c.pubchem_cid, c.name as cname,
		       t.id as tid, t.uniprot_acc, t.gene, t.pref_name, t.protein_name,
		       t.ensembl_gene, t.category,
		       a.score, a.evidence, a.mechanism, a.fetched_at
		from occurrence o
		join compound c on c.id = o.compound_id
		join activity a on a.compound_id = c.id
		join target t on t.id = a.target_id
		where o.taxon_id = ${taxonId}`;

	if (!rows.length) return null;

	// diseases per target
	const dis = await sql`
		select td.target_id, d.efo_id, d.name, td.score
		from target_disease td join disease d on d.id = td.disease_id
		where td.target_id in (select distinct target_id from activity a
		  join occurrence o on o.compound_id = a.compound_id where o.taxon_id = ${taxonId})
		order by td.score desc`;
	const disByTarget = new Map<number, { id: string; name: string; score: number }[]>();
	for (const d of dis) {
		const arr = disByTarget.get(d.target_id) ?? [];
		arr.push({ id: d.efo_id, name: d.name, score: d.score });
		disByTarget.set(d.target_id, arr);
	}

	const edges: Edge[] = [];
	const compoundTargets: Record<number, CompoundTargetRef[]> = {};
	const compoundChembl: Record<number, string | null> = {};
	const targetMap = new Map<number, TargetOut & { _tid: number }>();

	for (const r of rows) {
		const cid = Number(r.pubchem_cid);
		const acc = r.uniprot_acc;
		const score = round(r.score ?? 0);
		edges.push({ compound: r.cname, target: acc, score, evidence: r.evidence });
		(compoundTargets[cid] ??= []).push({ accession: acc, score, evidence: r.evidence, mechanism: r.mechanism ?? undefined });
		if (!(cid in compoundChembl)) compoundChembl[cid] = null;
		const prev = targetMap.get(r.tid);
		if (!prev || score > prev.score) {
			targetMap.set(r.tid, {
				_tid: r.tid,
				accession: acc,
				prefName: r.pref_name,
				gene: r.gene ?? null,
				proteinName: r.protein_name ?? r.pref_name,
				ensembl: r.ensembl_gene ?? null,
				category: r.category ?? null,
				score,
				diseases: disByTarget.get(r.tid) ?? []
			});
		}
	}
	const targets = [...targetMap.values()]
		.map(({ _tid, ...t }) => t)
		.sort((a, b) => b.score - a.score);

	const fetched = newestFetched(rows.map((r) => r.fetched_at as Date));
	return { targets, edges, compoundTargets, compoundChembl, partial: false, provenance: { store: true, fetchedAt: fetched, datasets: ['ChEMBL', 'UniProt', 'Open Targets'] } };
}

// ── WRITE: upsert a full profile (called by the ingest layer) ─────────────────
export async function writeProfile(base: PlantBase, tg: PlantTargets | null): Promise<void> {
	const sql = db();
	if (!sql) throw new Error('no DATABASE_URL');
	await migrate();

	await sql.begin(async (sql) => {
		const p = base.plant;
		const [tax] = await sql`
			insert into taxon (slug, scientific_name, common_name, family, ncbi_taxid, wikidata_qid, rank, blurb)
			values (${p.slug}, ${p.scientific}, ${p.common}, ${p.family}, ${p.taxon.ncbi ?? null}, ${p.taxon.wikidata ?? null}, ${p.taxon.rank}, ${p.blurb})
			on conflict (slug) do update set
				scientific_name = excluded.scientific_name, common_name = excluded.common_name,
				family = excluded.family, ncbi_taxid = excluded.ncbi_taxid,
				wikidata_qid = excluded.wikidata_qid, rank = excluded.rank, blurb = excluded.blurb
			returning id`;
		const taxonId = tax.id;

		// traditions: replace
		await sql`delete from tradition where taxon_id = ${taxonId}`;
		for (let i = 0; i < p.traditions.length; i++) {
			const tr = p.traditions[i];
			await sql`insert into tradition (taxon_id, ord, system, uses, note)
				values (${taxonId}, ${i}, ${tr.system}, ${tr.uses}, ${tr.note ?? null})`;
		}

		// literature
		await sql`insert into plant_literature (taxon_id, count, url, fetched_at)
			values (${taxonId}, ${base.literature.count}, ${base.literature.url}, now())
			on conflict (taxon_id) do update set count = excluded.count, url = excluded.url, fetched_at = now()`;

		// compounds + occurrence
		const cidToId = new Map<number, number>();
		const chemblByCid = tg?.compoundChembl ?? {};
		for (let i = 0; i < base.compounds.length; i++) {
			const c = base.compounds[i];
			const [row] = await sql`
				insert into compound (pubchem_cid, inchikey, chembl_id, name, smiles, formula, mw, xlogp, tpsa, iupac, fetched_at)
				values (${c.cid}, ${c.inchikey}, ${chemblByCid[c.cid] ?? c.chemblId}, ${c.name}, ${c.smiles}, ${c.formula}, ${c.mw}, ${c.xlogp}, ${c.tpsa}, ${c.iupac}, now())
				on conflict (pubchem_cid) do update set
					inchikey = coalesce(excluded.inchikey, compound.inchikey),
					chembl_id = coalesce(excluded.chembl_id, compound.chembl_id),
					smiles = coalesce(excluded.smiles, compound.smiles),
					formula = excluded.formula, mw = excluded.mw, xlogp = excluded.xlogp,
					tpsa = excluded.tpsa, iupac = excluded.iupac, fetched_at = now()
				returning id`;
			cidToId.set(c.cid, row.id);
			await sql`insert into occurrence (taxon_id, compound_id, ord, literature)
				values (${taxonId}, ${row.id}, ${i}, ${c.literature})
				on conflict (taxon_id, compound_id) do update set ord = excluded.ord, literature = excluded.literature, fetched_at = now()`;
		}

		if (tg) {
			// targets
			const accToId = new Map<string, number>();
			for (const t of tg.targets) {
				const [row] = await sql`
					insert into target (uniprot_acc, gene, pref_name, protein_name, ensembl_gene, category, fetched_at)
					values (${t.accession}, ${t.gene}, ${t.prefName}, ${t.proteinName}, ${t.ensembl}, ${t.category}, now())
					on conflict (uniprot_acc) do update set
						gene = excluded.gene, pref_name = excluded.pref_name, protein_name = excluded.protein_name,
						ensembl_gene = excluded.ensembl_gene, category = excluded.category, fetched_at = now()
					returning id`;
				accToId.set(t.accession, row.id);
				// diseases
				for (const d of t.diseases) {
					const [drow] = await sql`
						insert into disease (efo_id, name) values (${d.id}, ${d.name})
						on conflict (efo_id) do update set name = excluded.name returning id`;
					await sql`insert into target_disease (target_id, disease_id, score)
						values (${row.id}, ${drow.id}, ${d.score})
						on conflict (target_id, disease_id) do update set score = excluded.score`;
				}
			}
			// activities (from per-compound refs; resolve target ids, ingest any target not already inserted)
			for (const [cidStr, refs] of Object.entries(tg.compoundTargets)) {
				const compId = cidToId.get(Number(cidStr));
				if (!compId) continue;
				for (const ref of refs) {
					let tId = accToId.get(ref.accession);
					if (tId === undefined) {
						const [row] = await sql`
							insert into target (uniprot_acc) values (${ref.accession})
							on conflict (uniprot_acc) do update set uniprot_acc = excluded.uniprot_acc returning id`;
						tId = Number(row.id);
						accToId.set(ref.accession, tId);
					}
					await sql`insert into activity (compound_id, target_id, score, evidence, mechanism, fetched_at)
						values (${compId}, ${tId}, ${ref.score}, ${ref.evidence}, ${ref.mechanism ?? null}, now())
						on conflict (compound_id, target_id) do update set
							score = excluded.score, evidence = excluded.evidence, mechanism = excluded.mechanism, fetched_at = now()`;
				}
			}
		}
	});
}

export async function logRun(slug: string, status: string, note: string, targets: number): Promise<void> {
	const sql = db();
	if (!sql) return;
	try {
		await sql`insert into ingest_run (slug, status, note, targets, finished_at) values (${slug}, ${status}, ${note}, ${targets}, now())`;
	} catch {
		/* best effort */
	}
}

export type Provenance = { store: boolean; fetchedAt: string | null; datasets: string[] };

function newestFetched(dates: (Date | null | undefined)[]): string | null {
	const ts = dates.filter(Boolean).map((d) => new Date(d as Date).getTime());
	return ts.length ? new Date(Math.max(...ts)).toISOString() : null;
}
function round(n: number): number {
	return Math.round(n * 100) / 100;
}
