# Hepatoprotective Liver-Support Formulation — *Picrorhiza kurroa* (Kutki / Katuki)

**A worked product dossier generated with the HERBENZO pipeline.**
Category: oral nutraceutical (standardised botanical liver-support). Claim class:
nutraceutical liver-support — **NOT** a drug claim to treat any liver disease.

### Provenance of the numbers in this dossier
HERBENZO's rule is that nothing is asserted from memory. This dossier separates
what is **verified live now** from what the full pipeline **computes on redeploy**:

- **Verified live (this build):** molecular identity, formula, MW, PubChem CID and
  InChIKey of every active (Wikidata/PubChem, CC0); ChEMBL presence/absence of each
  active; UniProt target identity (e.g. CYP2E1 = P05181).
- **Ran live on the deployed site** (`/api/dossier?goal=hepatoprotective&species=picrorhiza-kurroa`,
  demo ~15 s / clean-room ~8 s): the directed ChEMBL activity query (0/3 goal targets —
  honestly sparse), PubMed co-mentions, the ranked actives, and the formulation (now
  designed around picroside I). All figures below are from that live run.

**Demo vs. clean-room (sandbox) — the provenance you can see:**
Run in **demo** mode, the compound list is the curated five (`seeded-catalogue`). Run in
**sandbox** mode (seeding + cache OFF), the pipeline resolves Kutki's compounds *live from
LOTUS* and independently returns **apocynin, androsin, picein, picroside I, catalpol,
cucurbitacin B** — overlapping with, but not identical to, the seed (it finds picroside I
and genuine constituents like catalpol/cucurbitacin B on its own, and misses picroside II /
kutkoside). That difference is the point: you can see exactly which claims survive without
the human prior, and the goal (targets + MOA) is walled off as an *a-priori hypothesis*.

---

## 1. Why this species

Kutki (*Picrorhiza kurroa*, Plantaginaceae; NCBI taxid 195120) is the classical
Ayurvedic **liver herb** — *Tikta* (bitter), used for *Yakrit* (liver) support,
*Kamala* (jaundice) and *deepana-pachana* (digestive fire). Its standardised iridoid
fraction — **"kutkin" / "picroliv"** (principally picroside I + kutkoside) — is one of
the **most-studied botanical hepatoprotectants** in the pharmacology literature.

Convergent traditional use across independent systems (an orthogonal evidence signal):

| System | Use |
|---|---|
| **Ayurveda** | *Yakrit* (liver), *Kamala* (jaundice), bitter tonic, *deepana-pachana* |
| **Unani** | Liver & spleen disorders, bitter hepatic tonic, fever |
| **Modern pharmacology** | Picroliv/kutkin — hepatoprotective, antioxidant, choleretic, immunomodulatory |

> **Sourcing / sustainability caveat (state up front):** *P. kurroa* is an
> over-harvested Himalayan species (IUCN-listed; CITES Appendix II) and is frequently
> substituted with *P. scrophulariiflora*. A credible product must use **cultivated,
> DNA-/marker-authenticated, picroside-standardised** material — this is both an
> ethics and an identity-control requirement.

---

## 2. Actives — molecular identity (verified: Wikidata/PubChem, CC0)

| Compound | Formula | PubChem CID | MW (g/mol) | InChIKey | Role |
|---|---|---|---|---|---|
| **Picroside I** | C₂₄H₂₈O₁₁ | 6440892 | 492.16 | XZGPUOQGERGURE-LUVHZPKESA-N | **Hero** — picroliv marker glycoside |
| **Picroside II** | C₂₃H₂₈O₁₃ | 11944602 | 512.15 | AKNILCMFRRDTEY-NUGKWEEESA-N | Marker glycoside; Nrf2 activator |
| **Kutkoside** | C₂₃H₂₈O₁₃ | 182265 | 512.15 | JANLDILJJLTVDB-UHFFFAOYSA-N | Co-marker in picroliv |
| **Apocynin** | C₉H₁₀O₃ | 2214 | 166.06 | DFYRUELUNQRZTB-UHFFFAOYSA-N | NADPH-oxidase inhibitor (anti-inflammatory) |
| **Androsin** | C₁₅H₂₀O₈ | 164648 | 328.12 | QUOZWMJFTQUXON-UXXRCYHCSA-N | Apocynin β-glucoside |

**Developability read (the key difference from a curcumin-type product):** the three
hepatoprotective marker glycosides are **large (MW 492–512) and heavily oxygenated
(11–13 O)** — i.e. **highly polar, with a permeability/bioavailability limit, not a
solubility limit**. That is the *opposite* of curcumin's problem and it drives the
whole formulation strategy (§6). Apocynin (MW 166) is small and lipophilic — permeable
but a minor contributor; androsin is its glucoside.

**Live ranking (deployed site, demo run).** The pipeline's composite score
(0.5·activity + 0.3·route-fit + 0.2·literature) ranks the actives: apocynin 0.36,
androsin 0.35, picroside I 0.29, picroside II 0.19, kutkoside 0.17. Read this honestly:
because **no active has measured target binding** (activity term = 0 for all), the ranking
collapses to route-fit + literature — so the small, permeable apocynin tops it. That is a
scoring artefact, not a statement that apocynin is the hepatoprotective hero. The
formulation (§6) therefore deliberately designs around **picroside I** (the claim-carrying
marker, 21 goal co-mentions), which is the molecule the product must actually deliver.

---

## 3. Mechanism of action — the liver-injury funnel (3 convergent layers)

Most liver injury — toxins, alcohol, metabolic stress — runs through one funnel: a
**reactive-radical source**, **collapse of antioxidant defence**, and a
**nitrosative/inflammatory amplifier** in resident Kupffer cells. A hepatoprotective
botanical should hit all three. This is a **phenotypic, pathway-level** effect, so the
honest centre of gravity is *in-vivo pharmacology*, not a single enzyme IC₅₀.

**A. Cut the radical source — CYP2E1 (UniProt P05181).**
CYP2E1 bioactivates hepatotoxins into reactive radicals (CCl₄ → •CCl₃; paracetamol →
NAPQI; ethanol metabolism). Reducing CYP2E1-driven bioactivation lowers the radical
load at its *origin* — the upstream event in toxin-induced injury.

**B. Restore antioxidant defence — Nrf2 / NFE2L2 (UniProt Q16236).**
Nrf2 is the master switch for the antioxidant-response element (HO-1, NQO1, glutathione
synthesis). Picroside II is a documented **Nrf2/HO-1 activator**, and the standardised
picroliv fraction **restores hepatic glutathione, SOD and catalase and lowers lipid
peroxidation (MDA)** across multiple models — the defensive programme switched back on.

**C. Quiet the inflammatory amplifier — iNOS / NOS2 (UniProt P35228).**
Activated Kupffer cells amplify injury via iNOS-derived nitric oxide, NF-κB and TNF-α.
**Apocynin is a classic NADPH-oxidase (NOX) inhibitor**, damping the oxidative burst
that feeds this arm.

**Plus (supporting, phenotype-level):** membrane stabilisation (serum ALT/AST/ALP/
bilirubin normalise in models), choleretic bile-flow stimulation, and promotion of
hepatocyte regeneration (nucleic-acid/protein synthesis) — all reported for picroliv.

**Net:** cut the radical source (A) + restore antioxidant defence (B) + quiet the
amplifier (C). Multi-point defence on one injury pathway — the network-pharmacology
thesis, not a single hit.

---

## 4. Target map (UniProt — all live-queryable)

| Target | Gene | UniProt | Role in mechanism | Evidence class |
|---|---|---|---|---|
| Cytochrome P450 2E1 | CYP2E1 | **P05181** | Bioactivates hepatotoxins → radicals | binding-queryable |
| Inducible NO synthase | NOS2 | **P35228** | Nitrosative amplifier (Kupffer cells) | binding-queryable |
| Nrf2 | NFE2L2 | **Q16236** | Antioxidant-response master switch | regulatory / literature |

---

## 5. The honest evidence read (the defensibility centrepiece)

**Directed ChEMBL check (verified live, this build):** the marker glycosides have
**no measured single-target binding** against the goal targets. Specifically —
kutkoside is **not in ChEMBL** at all; picroside II exists as a catalogued molecule
(CHEMBL510404) but without relevant target-binding assays; **apocynin** (CHEMBL346919)
is the only active with genuine molecular-pharmacology data (NADPH-oxidase/anti-
inflammatory).

**What that means — stated plainly:**
- Picrorhiza's hepatoprotection does **not** rest on a clean "molecule binds enzyme,
  IC₅₀ = X" story. The directed query returns sparse/empty, and the dossier **says so**
  rather than inventing a number.
- Instead, the evidence rests on **in-vivo pharmacology of the standardised fraction**
  (picroliv/kutkin): protection across CCl₄, paracetamol, thioacetamide, galactosamine,
  aflatoxin, alcohol and ischaemia-reperfusion models — read out as serum-enzyme
  normalisation, restored hepatic glutathione/SOD/catalase, reduced lipid peroxidation
  and improved histopathology — plus early/small human studies.

**The honest trade (this is what makes the claim credible):** on *target-binding*
evidence Picrorhiza is **weaker** than, say, a tyrosinase inhibitor with a measured
IC₅₀. On *whole-animal outcome* evidence it is **stronger** than most botanicals,
because a standardised fraction has been tested repeatedly in disease models. We claim
exactly that — no more.

---

## 6. Formulation — the real problem is permeability, not solubility

**Deficiency diagnosis (oral route) of the marker glycosides:**
- **Permeability (primary):** MW 492–512 with very high polar surface area → poor
  passive intestinal permeation. This is the dominant limit.
- **Pre-absorption hydrolysis / first-pass:** iridoid *glycosides* are liable to
  gut/ gut-microbial hydrolysis and conjugation — bioavailability of intact picrosides
  is low; part of the activity may come from absorbed aglycones/metabolites.
- **Solubility:** *not* the limiting factor here (glycosides are water-soluble) — the
  opposite of a curcumin pack.

**Excipient strategy (excipient KB + oral-delivery practice):**
1. **Phospholipid complex (phytosome) / self-emulsifying carrier** to raise membrane
   partitioning of the polar glycosides and shepherd them across the enterocyte.
2. **Permeation enhancement** (e.g. bile-salt/surfactant systems, or a bioenhancer)
   to address the primary permeability limit — the engine's permeability branch.
3. **Standardisation to total picroside content** (kutkin/picroliv basis), not raw herb
   weight — potency tracks the markers, so the "dose" is defined on the glycosides.

**Live engine output (ran on the deployed site, oral route):**
The engine formulates around **picroside I** — the active most co-mentioned with the
goal (21 papers), *not* apocynin (which ranks higher on drug-likeness but is a minor
constituent that needs no delivery help). Diagnosed deficiencies of picroside I:

| Deficiency | Severity | Reading |
|---|---|---|
| Low permeability | 0.77 | large, polar glycoside — the dominant, correct limit |
| First-pass metabolism | 0.60 | glycoside hydrolysis / conjugation |
| Chemical instability | 0.50 | oxygen-rich scaffold |

Matched excipients: **phospholipid phytosome, piperine (BioPerine®), liposomal
encapsulation, HP-β-cyclodextrin, quercetin (metabolic co-active)** — a coherent
picroside-bioavailability stack. Priority band **high**; directional exposure index
~17.8× (a labelled heuristic, *not* a measured fold-change — a learned PK model
replaces it when `ADMET_SERVICE_URL` is set).

> Note the honest read the engine prints alongside: *"a single measured active engages
> 0/3 goal targets — limited polypharmacology from binding data alone."* The formulation
> is strong on **delivering the marker**; the **efficacy** evidence still lives in §5's
> in-vivo tier, not in target binding.

---

## 7. Validation plan (tiered — each tier reproduces a platform claim)

**In-silico (platform — all ran live on the deployed site):**
- Identity → PubChem CIDs ✓ (§2)
- Oral drug-likeness → flagged the glycoside permeability limit (the real liability) ✓
- Directed target binding → ChEMBL query, honestly sparse (0/3 goal targets) ✓ (§5)
- Literature volume → PubMed co-mentions ✓ (picroside I 21 · picroside II 19 · kutkoside 9 ·
  apocynin + antioxidant 541)

**In-vitro (to commission):**
- Hepatocyte protection: CCl₄- or tBHP-challenged HepG2 / primary hepatocytes →
  viability, ALT/AST leakage, intracellular GSH, MDA, ROS.
- **Nrf2–ARE luciferase reporter** → confirm (B).
- **iNOS / nitric-oxide** in LPS-stimulated macrophages/Kupffer cells → confirm (C);
  NADPH-oxidase assay for apocynin.
- **CYP2E1 activity** (e.g. chlorzoxazone 6-hydroxylation) → confirm (A).

**In-vivo (the tier Picrorhiza's reputation actually rests on):**
- CCl₄ / paracetamol / thioacetamide rodent models → serum ALT/AST/ALP/bilirubin,
  hepatic GSH/SOD/catalase/MDA, histopathology; **benchmark against silymarin**.

**Clinical (nutraceutical support):**
- Standardised picroliv; liver-function markers and general-wellness endpoints —
  **support** claims, not disease-treatment claims.

---

## 8. How to defend "accurate, functional, literature-backed"

1. **Traceability** — every identity maps to an open record: PubChem CID → InChIKey →
   UniProt accession. The *ChEMBL sparsity itself* is a traceable, honest finding, not
   a gap we hide.
2. **Mechanistic coherence** — a 3-node injury funnel (CYP2E1 source → Nrf2 defence →
   iNOS amplifier) a reviewer can walk end to end.
3. **Evidence tiers, honestly weighted** — strongest at the **in-vivo** tier (picroliv
   across standard hepatotoxicity models), explicitly **thin at the single-target
   binding tier**. We lead with the strong tier and disclose the thin one.

**Honest caveats (they strengthen credibility):**
- **Nutraceutical liver-support only** — not a treatment for hepatitis, fatty liver,
  cirrhosis or any diagnosed disease; not a substitute for medical care.
- **Bioavailability** of intact picrosides is low (polar glycosides) — standardisation
  and a permeation-oriented formulation are essential, not optional.
- **Species/standardisation risk** — authenticate the species (no *scrophulariiflora*
  substitution) and standardise to picroside content; use cultivated, sustainable material.
- Single-target *in-vitro* potency is not the basis of the claim — the whole-animal,
  standardised-fraction evidence is. State it that way.

---

### Provenance
Generated by the live HERBENZO pipeline on the deployed site
(`anantham-s66h.vercel.app`): `/api/dossier?goal=hepatoprotective&species=picrorhiza-kurroa`,
also reproducible on `/design` (goal **Hepatoprotective / Liver Support** × species
**Kutki (Picrorhiza)**; flip the **Sandbox** toggle for the clean-room comparison).
Molecular identity (Wikidata/PubChem, CC0), the directed ChEMBL activity query, UniProt
target identity, PubMed co-mentions and the formulation are all pipeline-derived and
provenance-tagged on screen. The established picroliv/kutkin pharmacology cited in §3/§5/§7
is from the published hepatoprotection literature and is labelled as such, kept distinct
from the pipeline-computed figures — the molecular-biology claims (targets + MOA) are the
goal's *a-priori hypothesis*, not something the pipeline discovered.
