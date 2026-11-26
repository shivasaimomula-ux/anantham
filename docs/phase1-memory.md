# Phase 1 — The Memory Layer (runbook)

Gives the app a durable Postgres store so the serving path makes **zero** third-party
calls: reads are instant and survive upstream (ChEMBL/EBI) outages.

**Safe by design:** when `DATABASE_URL` is unset, the app falls back to the live
fan-out and behaves exactly as before. The store is an overlay, not a rewrite.

## How it works

```
ingest (live fan-out, offline)  ──writes──▶  Postgres  ──reads──▶  serving routes
  POST /api/admin/ingest                     (normalized,          /api/plant/[slug]
                                              with provenance)      /api/plant/[slug]/targets
```

- `src/lib/server/db.ts` — client, gated on `DATABASE_URL` (null → disabled).
- `src/lib/server/store.ts` — schema + normalized read/write (`readBase`, `readTargets`, `writeProfile`).
- `src/lib/server/ingest.ts` — runs the live fan-out once, materialises a plant.
- `/api/plant/[slug]` + `/targets` — **store first, live fallback**; payloads carry
  `provenance { store, fetchedAt, datasets }`, shown in the UI.

## Local

```bash
# 1. a Postgres reachable via DATABASE_URL in .env, e.g.
#    DATABASE_URL=postgresql://postgres@127.0.0.1:5433/herbenzo
#    ADMIN_TOKEN=some-token
npm run dev

# 2. materialise all seeded plants (schema auto-creates)
curl -X POST "http://localhost:5173/api/admin/ingest?all=1&token=$ADMIN_TOKEN"

# 3. reads now serve from the store (verify provenance.store === true)
curl -s http://localhost:5173/api/plant/turmeric | jq .provenance
```

## Production (handoff steps)

1. Create a managed Postgres (Neon / Supabase / Vercel Postgres). Copy the **pooled**
   connection string.
2. Set env vars on the host: `DATABASE_URL`, `ADMIN_TOKEN` (and keep `NCBI_API_KEY`).
3. Redeploy.
4. Ingest. On Vercel's 60s cap, ingest **per plant** (each ~3–45s):
   ```bash
   for s in turmeric white-turmeric ashwagandha artemisia ginger holy-basil; do
     curl -X POST "https://<host>/api/admin/ingest?slug=$s&token=$ADMIN_TOKEN"
   done
   ```
   (After the move to `adapter-node`, `?all=1` ingests everything in one call.)
5. Verify `provenance.store === true` on `/api/plant/turmeric`.

## Refresh

Re-run ingest any time to pull fresh upstream data (writes are upserts). Phase 5 wires
this to a schedule with a dataset-version changelog.
