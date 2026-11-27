# Anantam ML service

The learned-model layer that replaces the SvelteKit app's heuristics
(`admet.ts`, `server/formulate.ts`). It is a small Python/FastAPI microservice; the
app calls it when `ADMET_SERVICE_URL` is set and otherwise falls back to clearly
labeled heuristics (so the product works before this is trained — nothing is faked).

> Status: **scaffold**. The endpoints run today with transparent heuristics and
> `model_version: "heuristic-*"`. Each one marks exactly where a trained model loads.
> Training requires the datasets below + compute; it is not done yet.

## Why a separate service
The models (Chemprop D-MPNN, LightGBM rankers) are Python/ML-stack and GPU-friendly;
Vercel serverless is the wrong host. Deploy this on Render / Railway / Modal / HF
Spaces, then set `ADMET_SERVICE_URL=https://…` in the app's environment. The app
degrades gracefully if the service is down.

## The four modules

### 1. Learned ADMET & physicochemistry  → replaces reduced ESOL in `admet.ts`
- **Model:** Chemprop (D-MPNN) or ADMET-AI, trained on **Therapeutics Data Commons (TDC)**:
  `Solubility_AqSolDB` (logS), `Caco2_Wang` (permeability), `Bioavailability_Ma` (oral F%),
  `CYP3A4_Veith` / `CYP2C9_Veith` (first-pass), `Skin_Reaction`, `AMES`, `ClinTox`.
- **Output contract:** value **+ calibrated uncertainty** (ensemble std or conformal
  interval) **+ `in_domain`** — never a bare point estimate.
- Endpoint: `POST /predict/solubility`, `POST /predict/admet`.

### 2. Route-specific formulation / delivery  → replaces the `×` multiplier
- **Oral:** gradient-boosted ranker (LightGBM/CatBoost) on a curated set of **published
  human PK fold-changes** (plain curcumin, Meriva phytosome, NovaSOL, BCM-95,
  Cavacurmin, piperine co-formulations, quercetin/silybin phytosomes, …; 40–80 human PK
  arms with dose, fed/fasted, excipient class, ratio, AUC ratio). Target: `log(AUC fold-change)`.
  **Validation gate:** leave-one-compound-out (group CV) **Spearman ρ ≥ 0.70** on held-out
  human studies. Out of domain → return a **qualitative priority + similarity distance**,
  not a fabricated multiplier.
- **Topical:** a **separate** Potts–Guy / ML **skin-permeation** (`log Kp`) model on the
  **Flynn / HuskinDB** datasets + vehicle-compatibility checks (logP/MW window, vehicle pH
  vs active pKa/hydrolysis, clay adsorption, leave-on vs wash-off residence, photostability).
  **Never reuse oral PK ratios** (e.g. Meriva 29×) for topical.
- Endpoint: `POST /formulation/rank`.

### 3. Compatibility & multi-excipient optimizer  → replaces greedy top-2 picking
- Structured active–excipient–vehicle **compatibility matrix** (e.g. bentonite alkaline pH
  vs curcumin; FDA IID max `% w/w`; incompatible surfactant/polymer pairs; allergen caps).
- **Constrained multi-objective optimizer** (delivery + stability + regulatory precedent +
  cost, subject to route/pH/compatibility) instead of greedy selection. Rationale is
  generated strictly from the selected excipients.
- Endpoint: `POST /formulation/optimize`.

### 4. Evidence & literature reranker  → upgrades raw PubMed counts
- **PubTator 3 / Semantic Scholar** + embedding rerank: extract PMIDs/DOIs, study type
  (in-silico / in-vitro / animal / human RCT), sample size, direction of effect.
- Emit an **evidence-tier badge** + model version + dataset date on every dossier.
- Endpoint: `POST /evidence/rerank`.

## Run locally
```bash
cd ml-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# then in the app's env:  ADMET_SERVICE_URL=http://localhost:8000
```

## Training (not yet done — needs datasets + compute)
```bash
# 1. ADMET (Chemprop on TDC)
python train/admet.py --dataset Solubility_AqSolDB --ensemble 5 --out models/logS
# 2. Oral PK ranker (curate data/human_pk.csv first)
python train/oral_pk.py --data data/human_pk.csv --cv group --metric spearman
# 3. Topical skin permeation
python train/skin_kp.py --data data/huskindb.csv
```
Each trainer must write `models/<name>/{model, calibration, applicability_domain, VERSION}`
and only ship if it clears its validation gate.

## Contract the app expects
`POST /predict/solubility {smiles}` →
`{ "value": <logS>, "uncertainty": <±>, "model_version": "...", "in_domain": true|false }`
This matches `src/lib/server/predict.ts`; keep them in sync.
