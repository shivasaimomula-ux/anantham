<script lang="ts">
	import { onMount } from 'svelte';
	import { PLANT_INDEX } from '#lib/data/plants';
	import { loadRDKit, analyze, classify } from '#lib/client/chem';
	import { developability } from '#lib/client/admet';
	import { diagnose, recommend, scoreFormulation } from '#lib/client/formulate';
	import { EVIDENCE_TERMS, type Excipient } from '#lib/data/excipients';
	import type { PlantProfile, EnrichedCompound } from '#lib/types';

	type FdaExcipient = Excipient & { fdaProducts: number | null; fdaTerm: string | null };

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let rdkit = $state<any>(null);
	let current = $state(PLANT_INDEX[0].slug);
	let compounds = $state<EnrichedCompound[]>([]);
	let apiIdx = $state(0);
	let loading = $state(true);
	let selected = $state<string[]>([]);
	let evidence = $state<Record<string, number | undefined>>({});
	let fdaById = $state<Record<string, { fdaProducts: number | null }>>({});

	const api = $derived(compounds[apiIdx] ?? null);
	const dev = $derived(api?.desc ? developability(api.desc) : null);
	const diagnoses = $derived(api?.desc && dev ? diagnose(api.desc, dev) : []);
	const recs = $derived(recommend(diagnoses));
	const score = $derived(scoreFormulation(diagnoses, selected));

	onMount(async () => {
		fetch('/api/excipients')
			.then((r) => r.json())
			.then((d: { excipients: FdaExcipient[] }) => {
				fdaById = Object.fromEntries(d.excipients.map((e) => [e.id, { fdaProducts: e.fdaProducts }]));
			})
			.catch(() => {});
		try {
			rdkit = await loadRDKit();
		} catch {
			/* ignore */
		}
		await loadPlant(current);
	});

	async function loadPlant(slug: string) {
		current = slug;
		loading = true;
		selected = [];
		evidence = {};
		try {
			const r = await fetch(`/api/plant/${slug}`);
			const p: PlantProfile = await r.json();
			const list = p.compounds.map((c) => {
				let desc, qedClass;
				if (rdkit && c.smiles) {
					const d = analyze(rdkit, c.smiles);
					if (d) {
						desc = d;
						qedClass = classify(d.qed);
					}
				}
				return { ...c, desc, qedClass };
			});
			list.sort((a, b) => (b.desc?.qed ?? -1) - (a.desc?.qed ?? -1));
			compounds = list;
			apiIdx = 0;
		} finally {
			loading = false;
		}
	}

	function selectApi(i: number) {
		apiIdx = i;
		selected = [];
		evidence = {};
	}

	function toggle(id: string, name: string) {
		if (selected.includes(id)) {
			selected = selected.filter((x) => x !== id);
		} else {
			selected = [...selected, id];
			const term = EVIDENCE_TERMS[id] ?? name;
			if (api && evidence[id] === undefined) {
				evidence = { ...evidence, [id]: -1 }; // loading sentinel
				fetch(`/api/evidence?a=${encodeURIComponent(api.name)}&b=${encodeURIComponent(term)}`)
					.then((r) => r.json())
					.then((d) => (evidence = { ...evidence, [id]: d.count }))
					.catch(() => (evidence = { ...evidence, [id]: 0 }));
			}
		}
	}

	function autoFormulate() {
		const picks = recs.map((r) => r.options[0]?.id).filter(Boolean) as string[];
		selected = [];
		for (const id of [...new Set(picks)]) {
			const name = recs.flatMap((r) => r.options).find((o) => o.id === id)?.name ?? '';
			toggle(id, name);
		}
	}

	const expPct = (rel: number) => (Math.log10(Math.max(1, rel)) / Math.log10(30)) * 100;
</script>

<svelte:head><title>Formulate — HERBENZO</title></svelte:head>

<section class="hero">
	<div class="wrap">
		<div class="eyebrow">Phase 2 · Formulation engine</div>
		<h1 class="display">Engineer the <em>formulation</em>, not just the molecule</h1>
		<p class="lede muted">
			Pick an active, see exactly why the plain compound underperforms, then pair it with functional
			excipients — each matched to a deficiency and grounded in live FDA usage and literature — to
			design a preparation predicted to beat the raw herb.
		</p>
	</div>
</section>

<div class="selector">
	<div class="wrap selrow">
		<span class="sellabel mono">Plant</span>
		<div class="tabs">
			{#each PLANT_INDEX as p}
				<button class="tab" class:on={current === p.slug} onclick={() => loadPlant(p.slug)}>{p.common.replace(/ \(.*\)/, '')}</button>
			{/each}
		</div>
		<span class="sellabel mono div">Active (API)</span>
		<div class="tabs">
			{#each compounds as c, i}
				<button class="tab api" class:on={apiIdx === i} onclick={() => selectApi(i)}>{c.name}</button>
			{/each}
		</div>
	</div>
</div>

<section class="wrap main">
	<!-- LEFT: diagnosis + recommendations -->
	<div class="left">
		{#if loading}
			<div class="sk big"></div>
		{:else if api && dev}
			<div class="diag">
				<div class="dhead">
					<div>
						<span class="eyebrow">Diagnosis · {api.name}</span>
						<div class="dbcs">
							BCS class <b style="color:{dev.bcs.class === 'I' ? 'var(--good)' : dev.bcs.class === 'IV' ? 'var(--crit)' : 'var(--warn)'}">{dev.bcs.class}</b>
							· logS {dev.logS} · GI {dev.gi}
						</div>
					</div>
				</div>
				{#if diagnoses.length}
					<p class="dnote">{score.baselineNote}</p>
					<div class="defs">
						{#each diagnoses as d}
							<div class="def">
								<div class="deftop">
									<span class="defname">{d.label}</span>
									<span class="defsev mono">severity {(d.severity * 100).toFixed(0)}%</span>
								</div>
								<div class="defbar"><i style="width:{d.severity * 100}%"></i></div>
								<div class="defreason">{d.reason}</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="dnote good">This active is already BCS I — well-behaved. Formulation offers limited upside; pick another active to see the engine work.</p>
				{/if}
			</div>

			{#if recs.length}
				<div class="recs">
					<h3 class="rtitle display">Recommended excipients</h3>
					{#each recs as rec}
						<div class="recgroup">
							<div class="rglabel mono">for {rec.deficiency.label.toLowerCase()}</div>
							<div class="opts">
								{#each rec.options as e}
									{@const on = selected.includes(e.id)}
									{@const fda = fdaById[e.id]?.fdaProducts}
									<button class="opt" class:on onclick={() => toggle(e.id, e.name)}>
										<div class="otop">
											<span class="oname">{e.name}</span>
											<span class="ocheck">{on ? '✓' : '+'}</span>
										</div>
										<div class="oclass mono">{e.class}</div>
										<div class="omech">{e.mechanism}</div>
										<div class="ometa">
											<span class="opot">potency <i style="width:{e.potency * 44}px"></i></span>
											{#if fda != null && fda > 0}
												<span class="ofda mono">{fda.toLocaleString()} FDA products</span>
											{:else}
												<span class="ofda mono strat">{e.regulatory}</span>
											{/if}
										</div>
										{#if e.precedent}<div class="oprec mono">◆ {e.precedent}</div>{/if}
										{#if on}
											<div class="oev mono">
												{#if evidence[e.id] === -1}literature: checking…
												{:else if evidence[e.id] !== undefined}literature: {evidence[e.id]?.toLocaleString()} co-mentions with {api.name}
												{/if}
											</div>
										{/if}
									</button>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>

	<!-- RIGHT: formulation readout -->
	<aside class="right">
		<div class="readout">
			<div class="rohead">
				<span class="eyebrow">Your formulation</span>
				<button class="auto" onclick={autoFormulate} disabled={!diagnoses.length}>⚡ Auto-formulate</button>
			</div>

			<div class="expo">
				<div class="expnum display">
					{score.relExposure > 1 ? '≈ ' + score.relExposure + '×' : '1×'}
				</div>
				<div class="explab mono">predicted relative oral exposure vs. plain active</div>
				<div class="expbar">
					<i style="width:{expPct(score.relExposure)}%"></i>
					<span class="base">1×</span>
				</div>
			</div>

			<div class="cov">
				<div class="covlab mono">Deficiency coverage · {(score.coverage * 100).toFixed(0)}%</div>
				{#each score.perDeficiency as p}
					<div class="covrow" class:done={p.covered}>
						<span class="covmark">{p.covered ? '✓' : '○'}</span>
						<span class="covname">{p.label}</span>
						<span class="covby mono">{p.covered ? p.by.join(', ') : 'unaddressed'}</span>
					</div>
				{/each}
				{#if !score.perDeficiency.length}
					<div class="covrow done"><span class="covmark">✓</span><span class="covname">No major deficiencies</span></div>
				{/if}
			</div>

			{#if selected.length}
				<div class="chips2">
					{#each selected as id}
						{@const name = recs.flatMap((r) => r.options).find((o) => o.id === id)?.name ?? id}
						<span class="selchip">{name}<button onclick={() => toggle(id, name)} aria-label="remove">✕</button></span>
					{/each}
				</div>
			{:else}
				<p class="emptysel muted">Select excipients on the left, or hit Auto-formulate.</p>
			{/if}

			{#if score.extras.length}
				<p class="extra mono">⚠ {score.extras.map((e) => e.name).join(', ')} — not addressing a diagnosed deficiency.</p>
			{/if}

			<p class="disc mono">
				Model estimate for prioritisation — relative exposure is a bounded heuristic from
				deficiency coverage, anchored to literature precedents. Not a claim of clinical efficacy or
				bioequivalence.
			</p>
		</div>
	</aside>
</section>

<style>
	.hero {
		padding-block: 4rem 2rem;
		text-align: center;
	}
	.hero h1 {
		font-size: clamp(2rem, 4.5vw, 3.3rem);
		margin: 0.8rem 0 1rem;
		text-wrap: balance;
	}
	.hero h1 em {
		color: var(--jade);
		font-style: italic;
	}
	.lede {
		max-width: 42rem;
		margin: 0 auto;
		line-height: 1.65;
	}

	.selector {
		position: sticky;
		top: 4.2rem;
		z-index: 30;
		background: color-mix(in oklab, var(--ink) 92%, transparent);
		backdrop-filter: blur(10px);
		border-block: 1px solid var(--line);
	}
	.selrow {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding-block: 0.7rem;
		overflow-x: auto;
		flex-wrap: wrap;
	}
	.sellabel {
		font-size: 0.6rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--brass);
		white-space: nowrap;
	}
	.sellabel.div {
		border-left: 1px solid var(--line);
		padding-left: 0.8rem;
	}
	.tabs {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.tab {
		background: none;
		border: 1px solid transparent;
		border-radius: 999px;
		color: var(--bone-dim);
		font-size: 0.74rem;
		padding: 0.3rem 0.8rem;
		white-space: nowrap;
	}
	.tab:hover {
		color: var(--bone);
	}
	.tab.on {
		color: var(--ink);
		background: var(--jade);
		font-weight: 600;
	}
	.tab.api.on {
		background: var(--brass);
	}

	.main {
		display: grid;
		grid-template-columns: 1fr 340px;
		gap: 1.6rem;
		align-items: start;
		padding-block: 2rem 4rem;
	}
	.sk.big {
		height: 400px;
	}

	.diag {
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--ink-1);
		padding: 1.2rem;
		margin-bottom: 1.6rem;
	}
	.dbcs {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--bone-dim);
		margin-top: 0.3rem;
	}
	.dbcs b {
		font-size: 1.1rem;
	}
	.dnote {
		font-size: 0.86rem;
		color: var(--bone);
		margin: 0.9rem 0;
		font-style: italic;
	}
	.dnote.good {
		color: var(--good);
	}
	.defs {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.def {
		border-left: 2px solid var(--warn);
		padding-left: 0.9rem;
	}
	.deftop {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.defname {
		font-size: 0.92rem;
		color: var(--bone);
		font-weight: 600;
	}
	.defsev {
		font-size: 0.62rem;
		color: var(--warn);
	}
	.defbar {
		height: 3px;
		background: var(--ink-3);
		border-radius: 3px;
		margin: 0.4rem 0;
		overflow: hidden;
	}
	.defbar i {
		display: block;
		height: 100%;
		background: var(--warn);
	}
	.defreason {
		font-size: 0.74rem;
		color: var(--bone-dim);
	}

	.rtitle {
		font-size: 1.3rem;
		margin: 0 0 1rem;
	}
	.recgroup {
		margin-bottom: 1.4rem;
	}
	.rglabel {
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--brass);
		margin-bottom: 0.5rem;
	}
	.opts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.7rem;
	}
	.opt {
		text-align: left;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--ink-2);
		padding: 0.8rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		transition:
			border-color 0.15s,
			background 0.15s;
	}
	.opt:hover {
		border-color: var(--line-strong);
	}
	.opt.on {
		border-color: var(--jade-line);
		background: var(--jade-soft);
	}
	.otop {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.oname {
		font-size: 0.86rem;
		color: var(--bone);
		font-weight: 600;
		line-height: 1.2;
	}
	.ocheck {
		color: var(--jade);
		font-weight: 700;
		flex-shrink: 0;
	}
	.oclass {
		font-size: 0.6rem;
		color: var(--brass);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.omech {
		font-size: 0.72rem;
		color: var(--bone-dim);
		line-height: 1.4;
	}
	.ometa {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.2rem;
	}
	.opot {
		font-size: 0.6rem;
		color: var(--bone-faint);
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.opot i {
		display: inline-block;
		height: 4px;
		background: var(--jade);
		border-radius: 3px;
	}
	.ofda {
		font-size: 0.6rem;
		color: var(--jade);
	}
	.ofda.strat {
		color: var(--bone-faint);
	}
	.oprec {
		font-size: 0.6rem;
		color: var(--brass);
	}
	.oev {
		font-size: 0.62rem;
		color: var(--violet);
		border-top: 1px solid var(--line);
		padding-top: 0.35rem;
		margin-top: 0.15rem;
	}

	.right {
		position: sticky;
		top: 7rem;
	}
	.readout {
		border: 1px solid var(--line-strong);
		border-radius: 4px;
		background: linear-gradient(180deg, var(--ink-2), var(--ink-1));
		padding: 1.2rem;
	}
	.rohead {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}
	.auto {
		font-size: 0.64rem;
		letter-spacing: 0.04em;
		background: var(--brass);
		color: var(--ink);
		border: none;
		border-radius: 999px;
		padding: 0.35rem 0.7rem;
		font-weight: 600;
	}
	.auto:disabled {
		opacity: 0.4;
	}
	.expo {
		text-align: center;
		padding: 0.6rem 0 1rem;
		border-bottom: 1px solid var(--line);
	}
	.expnum {
		font-size: 2.8rem;
		color: var(--jade);
		line-height: 1;
	}
	.explab {
		font-size: 0.58rem;
		color: var(--bone-dim);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-top: 0.3rem;
	}
	.expbar {
		position: relative;
		height: 6px;
		background: var(--ink-3);
		border-radius: 3px;
		margin-top: 0.8rem;
		overflow: hidden;
	}
	.expbar i {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, var(--brass), var(--jade));
		transition: width 0.4s;
	}
	.expbar .base {
		display: none;
	}
	.cov {
		padding: 1rem 0;
		border-bottom: 1px solid var(--line);
	}
	.covlab {
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--brass);
		margin-bottom: 0.6rem;
	}
	.covrow {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.3rem 0;
		font-size: 0.78rem;
	}
	.covmark {
		color: var(--bone-faint);
	}
	.covrow.done .covmark {
		color: var(--good);
	}
	.covname {
		color: var(--bone);
		flex-shrink: 0;
	}
	.covby {
		font-size: 0.6rem;
		color: var(--bone-dim);
		margin-left: auto;
		text-align: right;
	}
	.chips2 {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		padding: 1rem 0;
	}
	.selchip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.7rem;
		background: var(--ink-3);
		border: 1px solid var(--jade-line);
		border-radius: 999px;
		padding: 0.25rem 0.3rem 0.25rem 0.6rem;
		color: var(--bone);
	}
	.selchip button {
		background: none;
		border: none;
		color: var(--bone-faint);
		font-size: 0.7rem;
	}
	.selchip button:hover {
		color: var(--crit);
	}
	.emptysel {
		font-size: 0.78rem;
		padding: 1rem 0;
	}
	.extra {
		font-size: 0.64rem;
		color: var(--warn);
		margin: 0.4rem 0 0;
	}
	.disc {
		font-size: 0.58rem;
		color: var(--bone-faint);
		line-height: 1.5;
		margin: 1rem 0 0;
		border-top: 1px solid var(--line);
		padding-top: 0.8rem;
	}

	@media (max-width: 900px) {
		.main {
			grid-template-columns: 1fr;
		}
		.right {
			position: static;
		}
		.opts {
			grid-template-columns: 1fr;
		}
	}
</style>
