# 3IT Phyto — Medicinal Plant Informatics (Phase 1)

A live web app that traces a medicinal plant **→ bioactive compounds → protein targets → diseases**,
computing every value on demand from open scientific databases. Built with SvelteKit.

This is the **Phase-1 discovery engine**. Phase 2 (formulation design — correlating each active/API
with functional excipients) builds on top of it.

## What's real here

Nothing on the Explore page is a stored figure — each number traces to a primary source:

| Layer | Source | License |
|-------|--------|---------|
| Plant → compound occurrence | **LOTUS** (via Wikidata) | CC0 |
| Compound identity & physicochemistry | **PubChem** | public domain |
| Drug-likeness (QED), Lipinski, structural alerts, 2D/3D depiction | **RDKit.js** (WASM, in-browser) | BSD |
| Compound → protein targets | **ChEMBL** (mechanisms + bioactivity, pChEMBL-derived confidence) | CC BY-SA 3.0 |
| Protein / gene identity | **UniProt** | CC BY 4.0 |
| Target → disease associations | **Open Targets** | CC0 |
| Predicted protein structures | **AlphaFold DB** | CC BY 4.0 |
| Literature evidence | **PubMed** (E-utilities) | NCBI |

The **QED** implementation is ported faithfully from RDKit's `Chem/QED.py` (ADS model, `WEIGHT_MEAN`,
all 116 structural-alert SMARTS) and validated to within 0.001 of RDKit's own reference values.

## Run locally

```bash
npm install
cp .env.example .env     # then add your NCBI key (see below)
npm run dev
```

Open http://localhost:5173.

### Environment variables

| Var | Purpose |
|-----|---------|
| `NCBI_API_KEY` | Lifts the PubMed E-utilities rate limit. Get one free at https://www.ncbi.nlm.nih.gov/account/ (Settings → API Key). Optional — the app degrades to lower PubMed limits without it. |

> **Server-side fetch note:** Node's built-in `fetch` does not honour an `HTTPS_PROXY` by default.
> If you run behind a proxy (some sandboxes), start with `NODE_USE_ENV_PROXY=1 npm run dev`.
> On normal hosts and on Vercel this is not needed.

## Deploy (Vercel)

`@sveltejs/adapter-auto` detects Vercel automatically.

1. Push to a Git repo and import it in Vercel.
2. Add `NCBI_API_KEY` in Project → Settings → Environment Variables.
3. Deploy.

Serverless note: a cold plant profile fans out to several APIs and takes a few seconds; results are
cached (6h) so repeat loads are instant. If your plan has a low function timeout, raise it (a cold
`/api/plant/[slug]` can take ~8s before caching).

## Architecture

```
src/lib/server/
  http.ts            fetch w/ retry, timeout, global concurrency cap
  cache.ts           in-memory TTL cache + in-flight de-dup + limiter
  sources/           one module per database (pubchem, chembl, uniprot, opentargets, pubmed)
  orchestrate.ts     fans out + merges into one PlantProfile (cached per plant)
src/lib/client/
  chem.ts            RDKit.js loader + QED/descriptors/alerts + 2D SVG
src/lib/components/   CompoundCard, QedGauge, TargetNetwork (Cytoscape), StructureViewer (3Dmol)
src/routes/
  api/plant/[slug]   the orchestrated profile endpoint
  api/structure/[cid]  PubChem 3D SDF proxy
  api/protein/[acc]    AlphaFold PDB proxy
  explore/           the interactive tool
```

## Plant → compound sourcing

The compound set per plant is currently **anchored on each plant's signature actives** for a fast,
reliable demo, with everything downstream fully live. A **fully-live LOTUS mode** (Wikidata SPARQL,
specificity-ranked) is implemented and can be switched on — it trades a few seconds of latency for
zero curation. See `src/lib/data/plants.ts`.

## License of this code

Prototype / demo. The upstream data retains its own licenses (above).
