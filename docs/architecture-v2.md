# HERBENZO — Architecture v2 (Redesign & Game Plan)

> Status: proposal. v1 is live at `anantham-blond.vercel.app`; this document defines
> the shape v2 should take and the order to build it in.

---

## 1. Diagnosis — what is actually wrong with v1

v1 is **a live API proxy with no memory.** Every page view re-derives everything
from slow third-party APIs, inside a 60-second serverless function.

Every problem we hit is a symptom of that one property:

| Symptom | Root cause |
|---|---|
| `/explore` 504'd on Vercel | One request did ~50–70 external calls > 60s cap |
| ChEMBL outage blanked the target panel | Request path depends on a flaky upstream being up *right now* |
| Cold start redoes all work | In-memory cache dies with the function instance |
| Only 6 plants, hardcoded | No store to hold plant→compound at scale |
| `/discover` will 504 | Builds all plants' profiles in one request |
| Can't iterate on formulations | Every "what if" re-queries the network |
| Hammering public APIs | No materialisation; politeness limits become our latency |

**The fix is not faster timeouts. It is to stop doing slow work in the request path.**

### Reconciling this with "strictly live, don't build on cached data"

That instruction was right, and it stays — but it needs a precise reading:

- **What must never happen** (the v1 bug, now fixed): caching *failures*, serving
  empty/stale results as if fresh, or a demo that *looks* live but is a mock.
- **What is legitimate and necessary**: a **materialised local mirror of open
  datasets**, refreshed on a schedule, with per-row `source`, `version` and
  `fetched_at` shown in the UI.

That second thing is not "cached data" in the sense meant — it is how every real
bioinformatics platform works. ChEMBL ships as a Postgres dump. Open Targets is a
versioned data release. LOTUS is published as a bulk download (CC0). **Open Targets
itself does not query ChEMBL at request time.** We should not either.

The honest UI contract becomes: *"ChEMBL 35 · fetched 2026-11-24 · [refresh from
source]"* — more defensible to a scientist than a spinner, because it is
reproducible and citable.

---

## 2. Target architecture — three planes

Split the one thing v1 does into three things with different time budgets.

```
┌─────────────────────────────────────────────────────────────────┐
│  INGESTION PLANE          (minutes–hours, no time limit)        │
│  Scheduled + on-demand ETL jobs                                 │
│  LOTUS · ChEMBL · PubChem · UniProt · Open Targets · PubMed     │
│         │  writes rows + provenance (source, version, fetched_at)│
└─────────┼───────────────────────────────────────────────────────┘
          ▼
┌─────────────────────────────────────────────────────────────────┐
│  STORE          Postgres (the system of record)                 │
│  taxon · compound · occurrence · target · activity · disease    │
│  pathway · tradition · excipient · formulation · product        │
└─────────┼───────────────────────────────────────────────────────┘
          ▼
┌─────────────────────────────────────────────────────────────────┐
│  SERVING PLANE            (< 200 ms, zero third-party calls)    │
│  SvelteKit routes read only from Postgres                       │
└─────────┼───────────────────────────────────────────────────────┘
          ▼
┌─────────────────────────────────────────────────────────────────┐
│  COMPUTE PLANE            (deterministic, pure, cacheable)      │
│  RDKit descriptors/QED · ADMET (ESOL…) · formulation scoring    │
│  Pure fn(SMILES, params) → precompute to store OR run in WASM   │
└─────────────────────────────────────────────────────────────────┘
```

**Key property:** nothing in the serving plane can be made slow or broken by a
third party. ChEMBL can be down for a day and the product still works.

### The mechanism that makes it work: read-through materialisation

This is the central design decision, and it is what answers *"can it take 200s?"*.

1. User asks for a plant we do not have yet (e.g. types *Curcuma aromatica*).
2. Serving plane finds no rows → **enqueues an ingest job** and returns
   `202 { status: "resolving", job_id }` immediately.
3. The job runs in the ingestion plane with **no time limit** — 30s, 200s, 10
   minutes, whatever ChEMBL's mood allows. It retries, backs off, survives outages.
4. UI shows live job progress ("resolved 4/6 compounds · querying ChEMBL…") over
   SSE/polling.
5. Rows land in Postgres with provenance. **Every later read is instant and durable.**

So the 200s of live work still happens — it just happens *in a job*, not in a
request. This simultaneously removes the 60s cap, the cold-start penalty, the
outage fragility, and the 6-plant limit.

---

## 3. Data model (first cut)

```sql
taxon(id, scientific_name, common_name, family, ncbi_taxid, wikidata_qid,
      rank, blurb)

compound(id, inchikey UNIQUE, pubchem_cid, chembl_id, name, smiles,
         formula, mw, xlogp, tpsa, hbd, hba, rotb,          -- from PubChem
         qed, logs, bcs_class, lipinski_violations,          -- computed
         source, version, fetched_at)

occurrence(taxon_id, compound_id, source,  -- 'LOTUS'
           ref_count, source_ref, fetched_at)   -- plant → compound

target(id, uniprot_acc UNIQUE, gene, pref_name, protein_name,
       ensembl_gene, chembl_target_id, organism, function_note)

activity(compound_id, target_id, std_type, std_value, std_units,
         pchembl, assay_chembl_id, source, fetched_at)   -- compound → target

disease(id, efo_id UNIQUE, name)
target_disease(target_id, disease_id, score, source)

pathway(id, source, ext_id, name)            -- KEGG/Reactome/GO/WikiPathways
target_pathway(target_id, pathway_id, fdr)

tradition(taxon_id, system, uses[], note, citation)   -- curated, cited
literature(subject_kind, subject_id, term, count, fetched_at)

-- product / Phase 2
excipient(id, name, addresses[], mechanism, potency, regulatory, precedent,
          fda_term, fda_product_count, fetched_at)
product(id, name, taxon_id, route, claim_class, goal_id, notes)
formulation(id, product_id, actives[], excipients[], score, rationale)
goal(id, label, target_accs[], pathway_ids[])  -- 'de-tan' → TYR, MITF…

ingest_run(id, source, version, scope, status, started_at, finished_at, error)
```

Two things this unlocks that v1 cannot do:
- **`occurrence`** makes plant→compound a *queryable relation* instead of a
  hardcoded array → any plant in LOTUS, and reverse queries ("which plants contain
  a tyrosinase inhibitor?").
- **`goal`** encodes product intent (see §4).

---

## 4. The product architecture (the part that actually matters)

The tyrosinase finding exposed a product-level flaw, not just a technical one:

> Ranking a plant's targets by raw potency surfaced APP and MAO-B for curcumin —
> **not tyrosinase.** For a de-tan product, the generic view shows the wrong answer.

Discovery and design are different questions and need different entry points:

| Mode | Question | Entry point | v1 status |
|---|---|---|---|
| **Plant-first** (discovery) | "What does this plant do?" | taxon → compounds → targets | ✅ built |
| **Target-first** (reverse) | "What hits TYR?" | target → actives → plants | partial (`/discover`) |
| **Goal-first** (design) | "Build me a de-tan product" | **goal → targets → actives → formulation → dossier** | ❌ missing |

**Goal-first is the product.** A formulator does not browse; they arrive with an
intent ("de-tan", "anti-inflammatory topical", "sleep nutraceutical"). A `goal` is a
curated bundle of targets/pathways with a claim class. Selecting it:

1. pulls actives with measured activity against those targets (from `activity`),
2. ranks by potency × drug-likeness × route fit × literature depth,
3. runs the **formulation engine** (deficiency → excipient match → exposure score),
4. **emits the dossier automatically.**

### The dossier generator is the killer feature

The *C. aromatica* dossier was assembled by hand this session. That artefact —
traceable actives, MOA chain, measured target evidence, formulation rationale,
tiered validation plan, literature counts, honest caveats — **is what a nutraceutical
or cosmetic formulator actually needs and cannot easily get.** It should be a button,
not a conversation. Every number is already in the store with provenance, so the
dossier is a *rendering of the database*, fully citable, reproducible, and exportable
to PDF for a regulator or an investor.

---

## 5. Hosting & platform

v1's host is wrong on three counts: 60s function cap, non-commercial Hobby terms,
and no database.

**Recommended target:**

| Concern | Choice | Why |
|---|---|---|
| App runtime | SvelteKit + `adapter-node` | No function time cap |
| Host | Fly.io / Railway / Render | Long jobs, persistent process, commercial-OK |
| Database | Managed Postgres (same host, or Neon/Supabase) | System of record |
| Jobs | Worker process + Postgres-backed queue (pg-boss / Graphile Worker) | No extra infra |
| Scheduled refresh | Cron in-host, or GitHub Actions | Versioned dataset pulls |
| Domain | `anantasanjeevani.com` (or HERBENZO subdomain) | Already owned |
| Privacy | App-level password gate + `noindex` | CT logs expose *any* hostname — only auth is real protection |

Deliberately **not** chosen: Vercel Pro ($20/mo buys a 300s cap but keeps the
serverless shape and still needs an external DB — paying to keep the wrong
architecture). Kubernetes/microservices: unjustified at this size.

### On bulk vs targeted ingestion

Full ChEMBL is a multi-GB dump — likely too heavy for a cheap host at first. Sequence:

1. **Start targeted** — read-through materialisation (§2) harvests only what is
   asked for, via the existing API adapters. Cheap, immediate, no infra change.
2. **Add LOTUS bulk** — comparatively small and CC0; this is what unlocks "any
   plant". High value per GB.
3. **Add ChEMBL bulk only if** API harvest latency becomes the bottleneck at scale.

This is why v1's work is not wasted: the `sources/*` adapters become the extractors.

---

## 6. What to keep, change, kill

**Keep as-is (genuinely good, reusable):**
- `lib/client/chem.ts` — RDKit QED/descriptors (validated to ±0.001 of RDKit refs)
- `lib/client/admet.ts` — ESOL, Lipinski/Veber/Egan/Ghose/Muegge, BCS
- `lib/client/formulate.ts`, `formula.ts` — deficiency → excipient → exposure scoring
- `lib/server/sources/*` — become ETL extractors instead of request-path callers
- UI components — `CompoundCard`, `CompoundDetail`, `TargetNetwork`, `StructureViewer`
- `http.ts` retry/limiter/timeout discipline — belongs in the worker

**Change:**
- `orchestrate.ts` → split into `ingest/` (writes store) + `queries/` (reads store)
- `data/plants.ts` → seed migration into `taxon`/`occurrence`/`tradition` tables
- `cache.ts` in-memory TTL → Postgres as the durable layer (keep a tiny request-scoped memo)
- Route handlers → thin SQL reads; `202 + job_id` when data is absent
- Provenance surfaced everywhere: dataset version + `fetched_at` + source link

**Kill:**
- Third-party calls in the request path
- `maxDuration`/time-budget scaffolding (an artefact of the wrong shape)
- `buildIndex()` fan-out over all plants (becomes indexed SQL)

---

## 7. Game plan — phased, each phase shippable

**Phase 0 — Stabilise (done)**
Split base/targets routes, time budget, ChEMBL hardening, no-cache-on-failure,
graceful degradation. v1 renders live today.

**Phase 1 — Give it a memory** ← *the unlock; everything else depends on it*
Postgres + schema + migrate the 6 seeded plants + rewrite reads as SQL + worker and
queue + read-through materialisation + provenance in UI.
*Exit:* every current page serves in <200ms and survives a ChEMBL outage.

**Phase 2 — Scale the plant universe**
LOTUS bulk ingest → thousands of taxa; species search/autocomplete; on-demand
resolve for anything not yet materialised.
*Exit:* type any species, get a real profile.

**Phase 3 — Goal-first design + dossier generator**
`goal` model, curated goal→target bundles (start with de-tan/TYR, validated this
session), goal-first ranking, **one-click dossier with PDF export**.
*Exit:* "de-tan" → ranked actives → formulation → citable dossier, unattended.

**Phase 4 — Formulation engine productised**
Excipient library with live openFDA precedent, multi-active complementarity,
route-aware scoring (topical vs oral — the *C. aromatica* case needs skin deposition
and photostability, not oral AUC), save/compare/version formulations.
*Exit:* a formulator designs and compares products in-app.

**Phase 5 — Productionise**
Own domain, auth gate, `noindex`, scheduled dataset refresh, dataset-version
changelog, investor demo path.

**Sequencing rule:** Phase 1 before any new feature. Building Phase 3/4 on v1's
request-path architecture means rebuilding them later.

---

## 8. Honest risks

| Risk | Mitigation |
|---|---|
| Phase 1 is a real refactor, not a tweak | Keep v1 deployed and working throughout; migrate route-by-route behind the same URLs |
| Bulk datasets outgrow a cheap host | Targeted-first (§5); add bulk per-source only when justified |
| Licensing — ChEMBL is CC BY-SA 3.0 | Attribute per-source in UI and dossier exports; LOTUS CC0, PubChem public domain |
| Curated `tradition`/`goal` data is hand-made | Cite every entry; mark clearly as curated ethnobotany, never as computed |
| Stale mirror presented as live | `fetched_at` + dataset version always visible; explicit refresh action |
| Over-claiming on cosmetic/health effects | Claim class on every product; cosmetic ≠ drug claims; caveats in dossier |
