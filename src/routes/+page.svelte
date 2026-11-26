<script lang="ts">
	const pipeline = [
		{ n: 'I', t: 'Plant', d: 'Traditional knowledge across Ayurveda, TCM & Western herbalism', src: 'LOTUS' },
		{ n: 'II', t: 'Compounds', d: 'Bioactive actives with live drug-likeness & structure', src: 'PubChem · RDKit' },
		{ n: 'III', t: 'Targets', d: 'Protein targets with measured binding evidence', src: 'ChEMBL · UniProt' },
		{ n: 'IV', t: 'Disease', d: 'Target–disease associations with evidence scores', src: 'Open Targets' }
	];
	const sources = [
		['PubChem', 'Compound identity & properties', 'public domain'],
		['ChEMBL', 'Bioactivity & targets', 'CC BY-SA 3.0'],
		['UniProt', 'Protein & gene identity', 'CC BY 4.0'],
		['Open Targets', 'Target–disease evidence', 'CC0'],
		['LOTUS', 'Plant–compound occurrence', 'CC0'],
		['AlphaFold', 'Predicted protein structures', 'CC BY 4.0'],
		['PubMed', 'Literature evidence', 'NCBI']
	];
</script>

<svelte:head><title>HERBENZO — Nature-Inspired Drug Discovery</title></svelte:head>

<section class="hero">
	<div class="wrap">
		<div class="eyebrow">Medicinal plant informatics</div>
		<h1 class="display">
			Where traditional medicine<br />meets <em>modern drug discovery</em>
		</h1>
		<p class="lede muted">
			Centuries of ethnobotanical knowledge, resolved into molecules, protein targets and disease
			biology — computed live on open scientific data. A systematic bridge from the plants people
			have always used to the leads a pipeline can act on.
		</p>
		<div class="herocta">
			<a href="/explore" class="btn btn-solid">Launch the explorer →</a>
			<a href="/how-it-works" class="btn btn-ghost">How it works</a>
		</div>
		<div class="herostats mono">
			<span><b>7</b> open databases</span>
			<span class="sep">·</span>
			<span><b>live</b> at query time</span>
			<span class="sep">·</span>
			<span><b>0</b> black-box lookups</span>
		</div>
	</div>
</section>

<section class="pipe">
	<div class="wrap">
		<div class="pipehead">
			<span class="eyebrow">The pipeline</span>
			<h2 class="display">Plant → lead compound, traced end to end</h2>
		</div>
		<div class="steps">
			{#each pipeline as s, i}
				<div class="step">
					<div class="snum display">{s.n}</div>
					<h3 class="display">{s.t}</h3>
					<p class="muted">{s.d}</p>
					<div class="ssrc mono">{s.src}</div>
					{#if i < pipeline.length - 1}<div class="arrow" aria-hidden="true">→</div>{/if}
				</div>
			{/each}
		</div>
	</div>
</section>

<section class="why">
	<div class="wrap whygrid">
		<div class="whytext">
			<span class="eyebrow">Why it matters</span>
			<h2 class="display">Traditional use is pre-validated biology</h2>
			<p class="muted">
				A plant used for the same condition across Ayurveda, Traditional Chinese Medicine and Western
				herbalism is a convergence signal — independent human-scale experiments pointing at real
				pharmacology. HERBENZO turns that signal into structured, queryable evidence: the exact
				compounds, their drug-likeness, the proteins they bind, and the diseases those proteins drive.
			</p>
			<p class="muted">
				<b class="hl">Phase two</b> builds on this foundation — pairing each active (API) with
				functional excipients to design formulations predicted to outperform the traditional
				preparations they came from.
			</p>
			<a href="/explore" class="btn btn-ghost">See a live example →</a>
		</div>
		<div class="whycard">
			<div class="wc-h mono">example · turmeric</div>
			<div class="wc-row"><span>Active</span><b class="display">Curcumin</b></div>
			<div class="wc-row"><span>Drug-likeness (QED)</span><b class="mono">0.55</b></div>
			<div class="wc-row"><span>Protein targets</span><b class="mono">11</b></div>
			<div class="wc-row"><span>Top target</span><b class="mono">APP → Alzheimer's</b></div>
			<div class="wc-row"><span>Literature</span><b class="mono">4,212 papers</b></div>
			<div class="wc-foot mono">all values computed live · not stored</div>
		</div>
	</div>
</section>

<section class="data">
	<div class="wrap">
		<div class="pipehead">
			<span class="eyebrow">Data foundation</span>
			<h2 class="display">Built entirely on open, licensed science</h2>
		</div>
		<div class="srcgrid">
			{#each sources as [name, role, lic]}
				<div class="srccard">
					<div class="srcname display">{name}</div>
					<div class="srcrole muted">{role}</div>
					<div class="srclic mono">{lic}</div>
				</div>
			{/each}
		</div>
	</div>
</section>

<style>
	.hero {
		padding-block: 6rem 4rem;
		text-align: center;
	}
	.hero h1 {
		font-size: clamp(2.6rem, 6vw, 4.6rem);
		line-height: 1.02;
		margin: 1rem 0 1.4rem;
		text-wrap: balance;
	}
	.hero h1 em {
		color: var(--jade);
		font-style: italic;
	}
	.lede {
		max-width: 42rem;
		margin: 0 auto;
		font-size: 1.05rem;
		line-height: 1.7;
	}
	.herocta {
		display: flex;
		gap: 0.8rem;
		justify-content: center;
		margin-top: 2rem;
		flex-wrap: wrap;
	}
	.herostats {
		margin-top: 2.2rem;
		font-size: 0.74rem;
		color: var(--bone-dim);
		display: flex;
		gap: 0.8rem;
		justify-content: center;
		flex-wrap: wrap;
	}
	.herostats b {
		color: var(--jade);
	}
	.herostats .sep {
		color: var(--bone-faint);
	}

	.pipe {
		padding-block: 3.5rem;
		border-top: 1px solid var(--line);
		background: var(--ink-1);
	}
	.pipehead {
		text-align: center;
		margin-bottom: 2.5rem;
	}
	.pipehead h2 {
		font-size: clamp(1.6rem, 3vw, 2.2rem);
		margin: 0.5rem 0 0;
	}
	.steps {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
	}
	.step {
		position: relative;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 1.4rem;
		background: var(--ink-2);
	}
	.snum {
		font-size: 1.6rem;
		color: var(--brass);
		opacity: 0.5;
	}
	.step h3 {
		margin: 0.3rem 0 0.5rem;
		font-size: 1.3rem;
		color: var(--bone);
	}
	.step p {
		font-size: 0.82rem;
		margin: 0 0 1rem;
		min-height: 3.6rem;
	}
	.ssrc {
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		color: var(--jade);
		text-transform: uppercase;
	}
	.arrow {
		position: absolute;
		right: -0.75rem;
		top: 50%;
		transform: translateY(-50%);
		color: var(--brass);
		font-size: 1.1rem;
		z-index: 2;
	}

	.why {
		padding-block: 4.5rem;
	}
	.whygrid {
		display: grid;
		grid-template-columns: 1.3fr 1fr;
		gap: 2.5rem;
		align-items: center;
	}
	.whytext h2 {
		font-size: clamp(1.7rem, 3vw, 2.4rem);
		margin: 0.6rem 0 1rem;
	}
	.whytext p {
		font-size: 0.95rem;
		line-height: 1.7;
		margin: 0 0 1rem;
	}
	.hl {
		color: var(--jade);
	}
	.whytext .btn {
		margin-top: 0.6rem;
	}
	.whycard {
		border: 1px solid var(--line-strong);
		border-radius: var(--radius);
		background: linear-gradient(180deg, var(--ink-2), var(--ink-1));
		padding: 1.4rem;
	}
	.wc-h {
		font-size: 0.64rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brass);
		margin-bottom: 1rem;
	}
	.wc-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
		padding: 0.6rem 0;
		border-bottom: 1px solid var(--line);
	}
	.wc-row span {
		font-size: 0.78rem;
		color: var(--bone-dim);
	}
	.wc-row b {
		color: var(--bone);
		font-size: 1.05rem;
	}
	.wc-foot {
		font-size: 0.6rem;
		color: var(--bone-faint);
		margin-top: 1rem;
	}

	.data {
		padding-block: 4rem;
		border-top: 1px solid var(--line);
		background: var(--ink-1);
	}
	.srcgrid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
	}
	.srccard {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 1.1rem;
		background: var(--ink-2);
		transition: border-color 0.2s;
	}
	.srccard:hover {
		border-color: var(--jade-line);
	}
	.srcname {
		font-size: 1.15rem;
		color: var(--jade);
	}
	.srcrole {
		font-size: 0.8rem;
		margin: 0.25rem 0 0.6rem;
	}
	.srclic {
		font-size: 0.62rem;
		color: var(--brass);
		letter-spacing: 0.04em;
	}

	@media (max-width: 860px) {
		.steps {
			grid-template-columns: repeat(2, 1fr);
		}
		.arrow {
			display: none;
		}
		.whygrid {
			grid-template-columns: 1fr;
		}
	}
</style>
