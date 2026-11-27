<script lang="ts">
	import { onMount } from 'svelte';
	import { PLANT_INDEX } from '#lib/data/plants';

	type GoalIdx = { id: string; label: string; claimClass: string; route: string; intent: string };
	type Hit = { slug: string; scientific: string; common: string | null; source: string };

	let goals = $state<GoalIdx[]>([]);
	let goalId = $state('de-tan');
	let speciesSlug = $state('white-turmeric');
	let speciesLabel = $state('White Turmeric (Curcuma aromatica)');

	// species search
	let q = $state('');
	let hits = $state<Hit[]>([]);
	let open = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let dossier = $state<any>(null);
	let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');

	onMount(async () => {
		try {
			const r = await fetch('/api/goals');
			goals = (await r.json()).goals ?? [];
		} catch {
			/* ignore */
		}
	});

	const goal = $derived(goals.find((g) => g.id === goalId));

	function onSearch() {
		clearTimeout(timer);
		const v = q.trim();
		if (v.length < 2) {
			hits = [];
			open = false;
			return;
		}
		timer = setTimeout(async () => {
			try {
				const r = await fetch(`/api/search?q=${encodeURIComponent(v)}`);
				hits = (await r.json()).hits ?? [];
				open = true;
			} catch {
				hits = [];
			}
		}, 280);
	}
	function pick(h: Hit) {
		speciesSlug = h.slug;
		speciesLabel = `${h.common ? h.common + ' ' : ''}(${h.scientific})`;
		q = '';
		hits = [];
		open = false;
	}

	async function generate() {
		status = 'loading';
		dossier = null;
		try {
			const r = await fetch(`/api/dossier?goal=${goalId}&species=${encodeURIComponent(speciesSlug)}`);
			if (!r.ok) throw new Error('failed');
			dossier = await r.json();
			status = 'ready';
		} catch {
			status = 'error';
		}
	}

	const dbColor: Record<string, string> = {
		LOTUS: 'var(--jade)',
		PubChem: 'var(--violet)',
		ChEMBL: 'var(--brass)',
		UniProt: 'var(--good)',
		'Open Targets': 'var(--warn)',
		PubMed: 'var(--jade)',
		'→ Conclusion': 'var(--bone)'
	};
	const fmtPc = (p: number | null) => (p == null ? '—' : p.toFixed(2));
</script>

<svelte:head><title>Design — HERBENZO</title></svelte:head>

<section class="hero">
	<div class="wrap">
		<div class="eyebrow">Goal-first design</div>
		<h1 class="display">From product intent to a <em>defensible dossier</em></h1>
		<p class="lede muted">
			Pick a product goal and a plant. The engine runs a <b>target-directed</b> query — measuring the
			plant's actives against the goal's protein targets — then shows the full reasoning chain across
			every database, so you can defend exactly why the result holds.
		</p>
	</div>
</section>

<div class="builder">
	<div class="wrap brow">
		<div class="goals">
			<span class="lbl mono">Goal</span>
			<div class="chips">
				{#each goals as g}
					<button class="chip" class:on={goalId === g.id} onclick={() => (goalId = g.id)}>
						<span class="cl">{g.label}</span>
						<span class="cr mono">{g.claimClass} · {g.route}</span>
					</button>
				{/each}
			</div>
		</div>
		<div class="species">
			<span class="lbl mono">Plant</span>
			<div class="searchwrap">
				<input
					class="inp mono"
					type="search"
					placeholder={speciesLabel}
					bind:value={q}
					oninput={onSearch}
					onfocus={() => hits.length && (open = true)}
					onblur={() => setTimeout(() => (open = false), 160)}
				/>
				{#if open && hits.length}
					<div class="res">
						{#each hits as h}
							<button class="r" onclick={() => pick(h)}>
								<span class="rsci">{h.scientific}</span>
								{#if h.common}<span class="rc mono">{h.common}</span>{/if}
								<span class="rs mono" class:lotus={h.source === 'lotus'}>{h.source}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
			<div class="quick mono">
				{#each PLANT_INDEX as p}
					<button class="qp" class:on={speciesSlug === p.slug} onclick={() => { speciesSlug = p.slug; speciesLabel = p.scientific; }}>{p.common.replace(/ \(.*\)/, '')}</button>
				{/each}
			</div>
		</div>
		<button class="gen btn-solid" onclick={generate} disabled={status === 'loading'}>
			{status === 'loading' ? 'Measuring…' : 'Generate dossier'}
		</button>
	</div>
	{#if goal}<div class="wrap intent mono">{goal.intent}</div>{/if}
</div>

{#if status === 'loading'}
	<div class="wrap"><div class="loading mono"><span class="dot"></span> resolving actives · querying ChEMBL for directed binding · corroborating against PubMed…</div></div>
{:else if status === 'error'}
	<div class="wrap"><div class="errbox">Couldn't generate — the plant may have no resolvable actives, or an upstream was slow. Try again.</div></div>
{:else if status === 'ready' && dossier}
	<div class="wrap dossier">
		<!-- header -->
		<div class="dhead">
			<div>
				<div class="eyebrow">{dossier.goal.label} · {dossier.goal.claimClass} · {dossier.goal.route}</div>
				<h2 class="display">{dossier.species.common}</h2>
				<div class="sci mono">{dossier.species.scientific} · {dossier.species.family}</div>
			</div>
			{#if dossier.lead}
				<div class="lead">
					<div class="llab mono">Lead active</div>
					<div class="lname display">{dossier.lead.name}</div>
					<div class="lmeta mono">score {dossier.lead.score} · route-fit {dossier.lead.routeFit} · {dossier.lead.literature.toLocaleString()} papers</div>
				</div>
			{/if}
		</div>

		{#if dossier.notes?.length}
			{#each dossier.notes as n}<p class="note mono">{n}</p>{/each}
		{/if}

		<p class="summary">{dossier.goal.summary}</p>

		<!-- REASONING CHAIN -->
		<section class="sec">
			<h3 class="shead display"><span class="sn">01</span> Reasoning chain — how the databases connect</h3>
			<p class="scap">Each step names the database, the join that links it to the chain, the finding, and why it advances the claim.</p>
			<div class="chain">
				{#each dossier.reasoning as s, i}
					<div class="step">
						<div class="sbadge" style="--c:{dbColor[s.database] ?? 'var(--brass)'}">{s.database}</div>
						<div class="sbody">
							<div class="sq">{s.question}</div>
							<div class="sconnect mono"><span class="k">connects</span> {s.connects}</div>
							<div class="sfind">{s.finding}</div>
							<div class="swhy mono">{s.whyItMatters}</div>
						</div>
						{#if i < dossier.reasoning.length - 1}<div class="sline"></div>{/if}
					</div>
				{/each}
			</div>
		</section>

		<!-- RANKED ACTIVES -->
		<section class="sec">
			<h3 class="shead display"><span class="sn">02</span> Ranked actives — directed against the goal's targets</h3>
			<div class="atable">
				<div class="arow ahead mono">
					<span>Active</span><span>Target hits (measured)</span><span>Route-fit</span><span>Papers</span><span>Score</span>
				</div>
				{#each dossier.actives as a}
					<div class="arow" class:lead={a.name === dossier.lead?.name}>
						<span class="an">{a.name}</span>
						<span class="ah mono">
							{#each a.hits.filter((h: any) => h.pchembl != null) as h}
								<span class="tg">{h.gene} <i>pChEMBL {fmtPc(h.pchembl)}</i></span>
							{/each}
							{#if !a.hits.some((h: any) => h.pchembl != null)}<span class="none">no measured binding</span>{/if}
						</span>
						<span class="mono">{a.routeFit}</span>
						<span class="mono">{a.literature.toLocaleString()}</span>
						<span class="mono sc">{a.score}</span>
					</div>
				{/each}
			</div>
		</section>

		<!-- TARGET BUNDLE -->
		<section class="sec">
			<h3 class="shead display"><span class="sn">03</span> Target bundle — the goal's mechanism</h3>
			<div class="tgrid">
				{#each dossier.targets as t}
					<div class="tcard">
						<div class="tg2"><b>{t.gene}</b> <span class="mono acc">{t.acc}</span> <span class="ev mono" class:reg={t.evidence === 'regulatory'}>{t.evidence}</span></div>
						<div class="tname">{t.name ?? t.gene}</div>
						<div class="trole mono">{t.role}</div>
						{#if t.functionNote}<div class="tfn muted">{t.functionNote}</div>{/if}
					</div>
				{/each}
			</div>
			<div class="moa">
				{#each dossier.goal.moa as m, i}
					<div class="ml"><span class="mln mono">{i + 1}</span><div><b>{m.step}</b> — {m.mechanism} <span class="via mono">{m.via.join(' · ')}</span></div></div>
				{/each}
			</div>
		</section>

		<!-- FORMULATION -->
		<section class="sec">
			<h3 class="shead display"><span class="sn">04</span> Formulation ({dossier.formulation.route})</h3>
			<div class="form">
				<div class="fcol">
					<div class="fh mono">Deficiencies to fix</div>
					<ul>{#each dossier.formulation.deficiencies as d}<li>{d}</li>{/each}</ul>
				</div>
				<div class="fcol">
					<div class="fh mono">Excipient strategy</div>
					<ul>{#each dossier.formulation.excipients as e}<li>{e}</li>{/each}</ul>
				</div>
			</div>
			<p class="frat">{dossier.formulation.rationale}</p>
		</section>

		<!-- EVIDENCE + CAVEATS -->
		<section class="sec">
			<h3 class="shead display"><span class="sn">05</span> Literature &amp; honest caveats</h3>
			<div class="lits">
				{#each dossier.literature as l}<span class="litchip mono">{l.term} <b>{l.count.toLocaleString()}</b></span>{/each}
			</div>
			<ul class="cav">{#each dossier.caveats as c}<li>{c}</li>{/each}</ul>
			<p class="prov mono">Generated {new Date(dossier.generatedAt).toISOString().slice(0, 16).replace('T', ' ')} · live from LOTUS · PubChem · ChEMBL · UniProt · PubMed. Every value traces to an open record.</p>
		</section>
	</div>
{:else}
	<div class="wrap"><div class="empty muted">Choose a goal and a plant, then generate a dossier.</div></div>
{/if}

<style>
	.hero {
		padding-block: 3.5rem 1.5rem;
		text-align: center;
	}
	.hero h1 {
		font-size: clamp(2rem, 4.5vw, 3.2rem);
		margin: 0.6rem 0;
		line-height: 1.05;
	}
	.hero h1 em {
		color: var(--jade);
		font-style: italic;
	}
	.lede {
		max-width: 44rem;
		margin: 0 auto;
		line-height: 1.6;
		font-size: 0.98rem;
	}

	.builder {
		position: sticky;
		top: 4.2rem;
		z-index: 30;
		background: color-mix(in oklab, var(--ink) 92%, transparent);
		backdrop-filter: blur(10px);
		border-block: 1px solid var(--line);
		padding-block: 1rem;
	}
	.brow {
		display: grid;
		grid-template-columns: 1fr 1fr auto;
		gap: 1.4rem;
		align-items: end;
	}
	.lbl {
		display: block;
		font-size: 0.6rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--brass);
		margin-bottom: 0.4rem;
	}
	.chips,
	.quick {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.chip {
		border: 1px solid var(--line);
		background: var(--ink-2);
		border-radius: 999px;
		padding: 0.4rem 0.8rem;
		text-align: left;
	}
	.chip.on {
		border-color: var(--jade-line);
		background: var(--jade-soft);
	}
	.chip .cl {
		display: block;
		font-size: 0.78rem;
		color: var(--bone);
	}
	.chip .cr {
		display: block;
		font-size: 0.56rem;
		color: var(--bone-faint);
		text-transform: uppercase;
	}
	.searchwrap {
		position: relative;
	}
	.inp {
		width: 100%;
		background: var(--ink-2);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 0.5rem 0.8rem;
		font-size: 0.74rem;
		color: var(--bone);
	}
	.inp:focus {
		outline: none;
		border-color: var(--jade-line);
	}
	.res {
		position: absolute;
		top: calc(100% + 0.3rem);
		left: 0;
		right: 0;
		z-index: 40;
		background: var(--ink-1);
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 18px 44px -16px rgba(0, 0, 0, 0.7);
	}
	.r {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		width: 100%;
		text-align: left;
		padding: 0.5rem 0.7rem;
		background: none;
		border: none;
		border-bottom: 1px solid var(--line);
	}
	.r:hover {
		background: var(--jade-soft);
	}
	.rsci {
		font-size: 0.8rem;
		font-style: italic;
		color: var(--bone);
	}
	.rc {
		font-size: 0.62rem;
		color: var(--bone-dim);
		flex: 1;
	}
	.rs {
		font-size: 0.52rem;
		text-transform: uppercase;
		color: var(--brass);
	}
	.rs.lotus {
		color: var(--jade);
	}
	.quick {
		margin-top: 0.5rem;
	}
	.qp {
		background: none;
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.2rem 0.6rem;
		font-size: 0.6rem;
		color: var(--bone-dim);
	}
	.qp.on {
		color: var(--jade);
		border-color: var(--jade-line);
	}
	.gen {
		white-space: nowrap;
		height: fit-content;
	}
	.intent {
		margin-top: 0.8rem;
		font-size: 0.7rem;
		color: var(--brass);
	}

	.loading,
	.empty,
	.errbox {
		margin: 2.5rem 0;
		padding: 1.2rem;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		font-size: 0.82rem;
		color: var(--bone-dim);
		text-align: center;
	}
	.errbox {
		border-color: var(--crit);
		color: var(--crit);
	}

	.dossier {
		padding-block: 2.5rem 4rem;
	}
	.dhead {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1.5rem;
		border-bottom: 1px solid var(--line);
		padding-bottom: 1.4rem;
	}
	.dhead h2 {
		margin: 0.3rem 0 0.15rem;
		font-size: 2rem;
		color: var(--bone);
	}
	.dhead .sci {
		font-size: 0.74rem;
		color: var(--bone-dim);
	}
	.lead {
		text-align: right;
		border: 1px solid var(--jade-line);
		background: var(--jade-soft);
		border-radius: var(--radius);
		padding: 0.8rem 1.1rem;
		min-width: 12rem;
	}
	.llab {
		font-size: 0.56rem;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--jade);
	}
	.lname {
		font-size: 1.5rem;
		color: var(--bone);
	}
	.lmeta {
		font-size: 0.62rem;
		color: var(--bone-dim);
		margin-top: 0.2rem;
	}
	.note {
		margin: 1rem 0 0;
		font-size: 0.68rem;
		color: var(--warn);
	}
	.summary {
		margin: 1.4rem 0 0;
		font-size: 0.95rem;
		line-height: 1.6;
		color: var(--bone-dim);
		max-width: 48rem;
	}

	.sec {
		margin-top: 2.6rem;
	}
	.shead {
		font-size: 1.3rem;
		color: var(--bone);
		display: flex;
		align-items: baseline;
		gap: 0.7rem;
		margin: 0 0 0.3rem;
	}
	.sn {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--brass);
	}
	.scap {
		margin: 0 0 1.2rem;
		font-size: 0.76rem;
		color: var(--brass);
	}

	.chain {
		display: flex;
		flex-direction: column;
	}
	.step {
		position: relative;
		display: grid;
		grid-template-columns: 7rem 1fr;
		gap: 1.1rem;
		padding-bottom: 1.4rem;
	}
	.sbadge {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #04110b;
		background: var(--c);
		border-radius: 6px;
		padding: 0.3rem 0.4rem;
		height: fit-content;
		text-align: center;
	}
	.sline {
		position: absolute;
		left: 3.5rem;
		top: 1.7rem;
		bottom: 0;
		width: 1px;
		background: var(--line);
	}
	.sbody {
		border-bottom: 1px solid var(--line);
		padding-bottom: 1.3rem;
	}
	.sq {
		font-size: 0.95rem;
		color: var(--bone);
		font-weight: 500;
	}
	.sconnect {
		font-size: 0.66rem;
		color: var(--bone-dim);
		margin: 0.4rem 0;
	}
	.sconnect .k {
		color: var(--jade);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin-right: 0.3rem;
	}
	.sfind {
		font-size: 0.86rem;
		color: var(--bone);
		border-left: 2px solid var(--brass);
		padding-left: 0.7rem;
		margin: 0.4rem 0;
	}
	.swhy {
		font-size: 0.72rem;
		color: var(--bone-dim);
		line-height: 1.5;
	}

	.atable {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.arow {
		display: grid;
		grid-template-columns: 1.3fr 2.4fr 0.8fr 0.8fr 0.7fr;
		gap: 0.8rem;
		padding: 0.7rem 1rem;
		border-bottom: 1px solid var(--line);
		align-items: center;
		font-size: 0.8rem;
	}
	.ahead {
		background: var(--ink-1);
		font-size: 0.58rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--brass);
	}
	.arow.lead {
		background: var(--jade-soft);
	}
	.an {
		color: var(--bone);
		font-weight: 500;
	}
	.ah {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		font-size: 0.64rem;
	}
	.tg {
		border: 1px solid var(--jade-line);
		border-radius: 4px;
		padding: 0.1rem 0.4rem;
		color: var(--bone);
	}
	.tg i {
		color: var(--jade);
		font-style: normal;
	}
	.none {
		color: var(--bone-faint);
	}
	.sc {
		color: var(--jade);
		font-weight: 600;
	}

	.tgrid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
	}
	.tcard {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 1rem;
		background: var(--ink-2);
	}
	.tg2 {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.tg2 b {
		color: var(--jade);
		font-size: 1rem;
	}
	.acc {
		font-size: 0.6rem;
		color: var(--bone-faint);
	}
	.ev {
		font-size: 0.52rem;
		text-transform: uppercase;
		color: var(--good);
		margin-left: auto;
	}
	.ev.reg {
		color: var(--warn);
	}
	.tname {
		font-size: 0.82rem;
		color: var(--bone);
		margin-top: 0.3rem;
	}
	.trole {
		font-size: 0.64rem;
		color: var(--bone-dim);
		margin-top: 0.2rem;
	}
	.tfn {
		font-size: 0.62rem;
		margin-top: 0.4rem;
		line-height: 1.45;
	}
	.moa {
		margin-top: 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.ml {
		display: flex;
		gap: 0.7rem;
		align-items: baseline;
		font-size: 0.82rem;
		color: var(--bone-dim);
	}
	.ml b {
		color: var(--bone);
	}
	.mln {
		color: var(--brass);
		font-size: 0.7rem;
	}
	.via {
		color: var(--jade);
		font-size: 0.6rem;
	}

	.form {
		display: grid;
		grid-template-columns: 1fr 1.3fr;
		gap: 1.5rem;
	}
	.fh {
		font-size: 0.58rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--brass);
		margin-bottom: 0.5rem;
	}
	.form ul {
		margin: 0;
		padding-left: 1.1rem;
	}
	.form li {
		font-size: 0.8rem;
		color: var(--bone);
		margin-bottom: 0.4rem;
		line-height: 1.4;
	}
	.frat {
		margin-top: 1rem;
		font-size: 0.84rem;
		color: var(--bone-dim);
		font-style: italic;
		border-left: 2px solid var(--jade);
		padding-left: 0.8rem;
	}

	.lits {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.litchip {
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.3rem 0.7rem;
		font-size: 0.64rem;
		color: var(--bone-dim);
	}
	.litchip b {
		color: var(--jade);
	}
	.cav {
		margin: 1rem 0 0;
		padding-left: 1.1rem;
	}
	.cav li {
		font-size: 0.76rem;
		color: var(--bone-dim);
		margin-bottom: 0.3rem;
	}
	.prov {
		margin-top: 1.2rem;
		font-size: 0.6rem;
		color: var(--bone-faint);
	}

	@media (max-width: 820px) {
		.brow {
			grid-template-columns: 1fr;
		}
		.dhead {
			flex-direction: column;
		}
		.lead {
			text-align: left;
		}
		.tgrid,
		.form {
			grid-template-columns: 1fr;
		}
		.arow {
			grid-template-columns: 1fr 1fr;
			gap: 0.4rem;
		}
		.step {
			grid-template-columns: 5rem 1fr;
		}
		.sline {
			left: 2.5rem;
		}
	}
</style>
