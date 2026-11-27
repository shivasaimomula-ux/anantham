"""
Anantam ML service — scaffold.

Runs today with transparent heuristics so the app's prediction boundary works end to
end before any model is trained. Every response carries `model_version` and
`in_domain`; a `heuristic-*` version means "not a trained model yet". Each endpoint
marks where the trained model loads.

Contract matches src/lib/server/predict.ts.
"""
from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Anantam ML service", version="0.1.0-scaffold")

# RDKit is optional at scaffold time; the heuristic degrades to logP/MW-free if absent.
try:
    from rdkit import Chem
    from rdkit.Chem import Crippen, Descriptors

    _RDKIT = True
except Exception:  # pragma: no cover
    _RDKIT = False


# ── schemas ───────────────────────────────────────────────────────────────────
class SmilesIn(BaseModel):
    smiles: str


class Prediction(BaseModel):
    value: float
    uncertainty: float | None = None
    model_version: str
    in_domain: bool


class RankIn(BaseModel):
    active_smiles: str
    route: str  # "oral" | "topical"
    candidates: list[dict]  # [{excipient_class, ratio, fed_fasted?}, ...]


class EvidenceIn(BaseModel):
    query: str
    pmids: list[str] = []


# ── module 1: ADMET ─────────────────────────────────────────────────────────────
def _logp_mw(smiles: str) -> tuple[float | None, float | None]:
    if not _RDKIT:
        return None, None
    m = Chem.MolFromSmiles(smiles)
    if m is None:
        return None, None
    return float(Crippen.MolLogP(m)), float(Descriptors.MolWt(m))


@app.post("/predict/solubility", response_model=Prediction)
def predict_solubility(inp: SmilesIn) -> Prediction:
    # TODO(module-1): load Chemprop ensemble trained on TDC Solubility_AqSolDB and
    # return mean logS + ensemble std (or conformal interval) + applicability domain.
    logp, mw = _logp_mw(inp.smiles)
    if logp is None or mw is None:
        # cannot parse — out of domain, neutral value
        return Prediction(value=-3.0, uncertainty=None, model_version="heuristic-esol-0", in_domain=False)
    logS = 0.16 - 0.63 * logp - 0.0062 * mw  # reduced ESOL (Delaney)
    return Prediction(
        value=round(logS, 2),
        uncertainty=None,  # a heuristic has no calibrated interval
        model_version="heuristic-esol-0",
        in_domain=(-2 <= logp <= 7 and mw <= 900),
    )


@app.post("/predict/admet")
def predict_admet(inp: SmilesIn) -> dict:
    # TODO(module-1): Chemprop multitask — Caco2_Wang, Bioavailability_Ma,
    # CYP3A4/2C9_Veith, Skin_Reaction, AMES, ClinTox — each value + uncertainty.
    sol = predict_solubility(inp)
    return {
        "solubility_logS": sol.model_dump(),
        "permeability": None,
        "bioavailability_F": None,
        "cyp3a4": None,
        "ames": None,
        "note": "scaffold — only solubility (heuristic) is wired; train the rest per README.",
    }


# ── module 2: route-specific formulation ranker ────────────────────────────────
@app.post("/formulation/rank")
def formulation_rank(inp: RankIn) -> dict:
    # TODO(module-2): oral -> LightGBM ranker on human PK fold-changes (gate: LOCO
    # Spearman >= 0.70); topical -> Potts-Guy / ML log Kp. Out of domain -> qualitative
    # priority + similarity distance, NOT a fabricated multiplier.
    return {
        "ranked": [{**c, "priority": "unscored"} for c in inp.candidates],
        "model_version": f"heuristic-{inp.route}-0",
        "in_domain": False,
        "note": "scaffold — returns candidates unscored; train the ranker per README.",
    }


# ── module 4: evidence reranker ────────────────────────────────────────────────
@app.post("/evidence/rerank")
def evidence_rerank(inp: EvidenceIn) -> dict:
    # TODO(module-4): PubTator 3 / Semantic Scholar + embedding rerank -> study type,
    # sample size, direction of effect, evidence tier.
    return {
        "query": inp.query,
        "ranked": [{"pmid": p, "tier": "unknown"} for p in inp.pmids],
        "model_version": "heuristic-evidence-0",
        "note": "scaffold — extract study type/direction per README.",
    }


@app.get("/health")
def health() -> dict:
    return {"ok": True, "rdkit": _RDKIT, "version": app.version}
