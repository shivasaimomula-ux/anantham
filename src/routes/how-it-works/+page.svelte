<script lang="ts">
	const stages = [
		{
			n: '01',
			t: 'Resolve the plant',
			d: 'A species maps to its documented bioactive compounds via LOTUS natural-product occurrence data (CC0). Traditional-use context is drawn from curated ethnobotany across Ayurveda, TCM and Western herbalism.',
			tag: 'LOTUS'
		},
		{
			n: '02',
			t: 'Characterise each active',
			d: 'Every compound is looked up in PubChem for identity, formula and physicochemistry. RDKit (WASM, in your browser) computes QED drug-likeness, Lipinski rules, TPSA and 116 structural alerts, and draws the 2D structure — nothing is a stored value.',
			tag: 'PubChem · RDKit'
		},
		{
			n: '03',
			t: 'Map protein targets',
			d: 'ChEMBL supplies curated mechanisms and measured bioactivities; a confidence score is derived from pChEMBL potency. UniProt resolves the canonical human protein, gene and Ensembl identifier.',
			tag: 'ChEMBL · UniProt'
		},
		{
			n: '04',
			t: 'Link to disease',
			d: 'Each target is queried against Open Targets (CC0) for its strongest disease associations and evidence scores — the bridge from molecule to indication.',
			tag: 'Open Targets'
		},
		{
			n: '05',
			t: 'Weigh the evidence',
			d: 'PubMed supplies live literature volume for the plant and plant–compound co-mentions. AlphaFold provides a predicted 3D fold for any target, rendered on demand.',
			tag: 'PubMed · AlphaFold'
		}
	];
</script>

<svelte:head><title>How It Works — HERBENZO</title></svelte:head>

<section class="hero">
	<div class="wrap">
		<div class="eyebrow">How it works</div>
		<h1 class="display">Every value, computed from a primary source</h1>
		<p class="lede muted">
			HERBENZO is a live orchestration layer over open scientific databases. A single plant query
			fans out across seven sources, merges the results, and returns one evidence-linked profile.
			Nothing is a hand-entered figure — each number traces back to a source you can open.
		</p>
	</div>
</section>

<section class="flow">
	<div class="wrap">
		{#each stages as s}
			<div class="stage">
				<div class="sn mono">{s.n}</div>
				<div class="sbody">
					<div class="sh">
						<h2 class="display">{s.t}</h2>
						<span class="stag mono">{s.tag}</span>
					</div>
					<p class="muted">{s.d}</p>
				</div>
			</div>
		{/each}
	</div>
</section>

<section class="honest">
	<div class="wrap">
		<div class="hgrid">
			<div>
				<span class="eyebrow">What it is</span>
				<ul class="good">
					<li>Live queries to open, licensed databases</li>
					<li>Real cheminformatics (RDKit QED validated to RDKit's own references)</li>
					<li>Evidence-scored target and disease links</li>
					<li>Every figure traceable to a primary source</li>
				</ul>
			</div>
			<div>
				<span class="eyebrow">What it is not</span>
				<ul class="warn">
					<li>Not a claim of clinical efficacy</li>
					<li>Not a substitute for experimental validation</li>
					<li>Confidence scores are evidence proxies, not probabilities of success</li>
					<li>Traditional-use text is curated reference, not a live feed</li>
				</ul>
			</div>
		</div>
	</div>
</section>

<section class="cta">
	<div class="wrap">
		<a href="/explore" class="btn btn-solid">Open the explorer →</a>
	</div>
</section>

<style>
	.hero {
		padding-block: 5rem 3rem;
		text-align: center;
	}
	.hero h1 {
		font-size: clamp(2.2rem, 4.5vw, 3.4rem);
		margin: 0.8rem 0 1.2rem;
		text-wrap: balance;
	}
	.lede {
		max-width: 40rem;
		margin: 0 auto;
		line-height: 1.7;
	}

	.flow {
		padding-block: 2rem 4rem;
	}
	.stage {
		display: grid;
		grid-template-columns: 5rem 1fr;
		gap: 1.5rem;
		padding-block: 2rem;
		border-top: 1px solid var(--line);
	}
	.stage:last-child {
		border-bottom: 1px solid var(--line);
	}
	.sn {
		font-size: 1.6rem;
		color: var(--brass);
		opacity: 0.55;
	}
	.sh {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 0.5rem;
	}
	.sh h2 {
		margin: 0;
		font-size: 1.5rem;
		color: var(--bone);
	}
	.stag {
		font-size: 0.64rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--jade);
		border: 1px solid var(--jade-line);
		border-radius: 999px;
		padding: 0.2rem 0.6rem;
	}
	.sbody p {
		max-width: 46rem;
		font-size: 0.95rem;
		line-height: 1.7;
		margin: 0;
	}

	.honest {
		padding-block: 3.5rem;
		background: var(--ink-1);
		border-top: 1px solid var(--line);
	}
	.hgrid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2.5rem;
	}
	.hgrid ul {
		list-style: none;
		padding: 0;
		margin: 1rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.hgrid li {
		font-size: 0.9rem;
		padding-left: 1.5rem;
		position: relative;
		color: var(--bone);
	}
	.good li::before {
		content: '✓';
		position: absolute;
		left: 0;
		color: var(--good);
	}
	.warn li::before {
		content: '—';
		position: absolute;
		left: 0;
		color: var(--warn);
	}

	.cta {
		padding-block: 3.5rem;
		text-align: center;
		border-top: 1px solid var(--line);
	}

	@media (max-width: 720px) {
		.hgrid {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}
		.stage {
			grid-template-columns: 1fr;
			gap: 0.5rem;
		}
	}
</style>
