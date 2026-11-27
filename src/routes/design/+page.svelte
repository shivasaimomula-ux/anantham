<script lang="ts">
	import { onMount } from 'svelte';
	import { PLANT_INDEX } from '#lib/data/plants';

	type GoalIdx = { id: string; label: string; claimClass: string; route: string; intent: string };
	type Hit = { slug: string; scientific: string; common: string | null; source: string };

	let goals = $state<GoalIdx[]>([]);
	let goalId = $state('de-tan');
	let speciesSlug = $state('white-turmeric');
	let speciesLabel = $state('White Turmeric (Curcuma aromatica)');
	// Clean-room mode: strip human-seeded catalogue + cache so the monograph is
	// derived purely live (the goal stays, walled off as an a-priori hypothesis).
	let sandbox = $state(false);

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

	let saveState = $state<'idle' | 'saving' | 'saved' | 'error' | 'nostore'>('idle');
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let saved = $state<any[]>([]);

	async function generate() {
		status = 'loading';
		dossier = null;
		saveState = 'idle';
		try {
			const r = await fetch(`/api/dossier?goal=${goalId}&species=${encodeURIComponent(speciesSlug)}${sandbox ? '&mode=sandbox' : ''}`);
			if (!r.ok) throw new Error('failed');
			dossier = await r.json();
			status = 'ready';
			loadSaved();
		} catch {
			status = 'error';
		}
	}

	async function saveDossier() {
		if (!dossier) return;
		saveState = 'saving';
		try {
			const r = await fetch('/api/formulation', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ goal: dossier.goal, species: dossier.species, formulation: dossier.formulation })
			});
			if (r.status === 503) {
				saveState = 'nostore';
				return;
			}
			if (!r.ok) throw new Error();
			saveState = 'saved';
			loadSaved();
		} catch {
			saveState = 'error';
		}
	}

	async function loadSaved() {
		try {
			const r = await fetch(`/api/formulation?goal=${goalId}&species=${encodeURIComponent(speciesSlug)}`);
			saved = (await r.json()).items ?? [];
		} catch {
			saved = [];
		}
	}

	const dbColor: Record<string, string> = {
		LOTUS: 'var(--jade)',
		Catalogue: 'var(--brass)',
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
		<div class="genrow">
			<button class="gen btn-solid" onclick={generate} disabled={status === 'loading'}>
				{status === 'loading' ? 'Measuring…' : 'Generate dossier'}
			</button>
			<label class="sbx mono" class:on={sandbox} title="Strip human-seeded compound lists and cache; derive everything live from LOTUS. The goal stays as a labelled hypothesis.">
				<input type="checkbox" bind:checked={sandbox} />
				Sandbox (clean-room) — no seeding, no cache
			</label>
		</div>
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

		{#if dossier.provenance}
			<div class="provbar {dossier.provenance.mode}">
				<div class="pbhead mono">
					<span class="pbmode">{dossier.provenance.mode === 'sandbox' ? '🧪 Sandbox — clean-room' : '🎬 Demo'}</span>
					<span class="pbdot">·</span>compounds: <b>{dossier.provenance.compoundSource === 'lotus-live' ? 'live LOTUS' : 'seeded catalogue'}</b>
					<span class="pbdot">·</span>{dossier.provenance.freshness === 'live-fresh' ? 'fresh (cache off)' : 'may be cached'}
				</div>
				<p class="pbnote mono">{dossier.provenance.note}</p>
				<div class="pblegend">
					<span class="ptag live">molecular identity · live</span>
					<span class="ptag live">measured binding · live</span>
					<span class="ptag live">literature · live</span>
					<span class="ptag hyp">target bundle · hypothesis</span>
					<span class="ptag hyp">mechanism · hypothesis</span>
					<span class="ptag kb">excipients · curated KB</span>
					<span class="ptag heur">exposure index · heuristic</span>
				</div>
			</div>
		{/if}

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
								<span class="tg" class:lc={h.lowConfidence}>{h.gene} <i>pChEMBL {fmtPc(h.pchembl)}</i>{#if h.lowConfidence}<em class="lcm" title="single cell-free record — weak evidence">⚠</em>{/if}</span>
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
			<h3 class="shead display"><span class="sn">03</span> Target bundle — the goal's mechanism <span class="hypbadge mono">a-priori hypothesis · human-defined</span></h3>
			<p class="scap">These targets and the mechanism below are the <b>question we set out to test</b>, defined in the goal — not something the pipeline discovered. The measured binding above (section 02) is the independent evidence against them.</p>
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
			<h3 class="shead display"><span class="sn">04</span> Formulation engine ({dossier.formulation.route})</h3>
			<p class="scap">Solubility: {dossier.formulation.admetMethod === 'model' ? 'learned ADMET model' : 'transparent heuristic (reduced ESOL)'} · exposure index is a directional heuristic, not a measured fold-change.</p>
			<div class="fhead">
				<div class="fexp">
					<div class="fexpband {dossier.formulation.priorityBand}">{dossier.formulation.priorityBand} priority</div>
					<div class="fexpl mono">directional index ~{dossier.formulation.exposureIndex}× · heuristic, not a measured fold-change</div>
					<div class="fexpb mono">{dossier.formulation.exposureBasis}</div>
				</div>
				<div class="fcomp">
					<div class="fh mono">{dossier.formulation.complementarity.complementary ? 'Multi-active complementarity' : 'Target coverage (overlapping)'} · {Math.round(dossier.formulation.complementarity.score * 100)}%</div>
					<div class="fcov mono">{dossier.formulation.complementarity.distinctTargets}/{dossier.formulation.complementarity.totalTargets} goal targets engaged by measured actives</div>
					<div class="fcl">
						{#each dossier.formulation.complementarity.actives as a}
							<div class="fci"><span class="fcname">{a.name}</span> <span class="fctg mono">{a.covers.join(' · ')}</span></div>
						{/each}
					</div>
					<p class="fcn mono">{dossier.formulation.complementarity.note}</p>
				</div>
			</div>

			<div class="fh mono fdh">Diagnosed deficiencies of the lead active</div>
			<div class="defs">
				{#each dossier.formulation.deficiencies as d}
					<div class="def">
						<div class="deft"><b>{d.label}</b><span class="defbar"><i style="width:{Math.round(d.severity * 100)}%"></i></span></div>
						<div class="defr mono">{d.reason}</div>
					</div>
				{/each}
				{#if !dossier.formulation.deficiencies.length}<p class="muted">Lead active is already well-behaved — limited formulation upside.</p>{/if}
			</div>

			<div class="fh mono fdh">Matched excipients · live regulatory + literature precedent</div>
			<div class="excs">
				{#each dossier.formulation.excipients as e}
					<div class="exc">
						<div class="exct">
							<span class="excn">{e.name}</span>
							<span class="exccl mono">{e.class}</span>
						</div>
						<div class="excm">{e.mechanism}</div>
						<div class="excb">
							{#each e.addresses as a}<span class="excd mono">{a}</span>{/each}
							{#if e.fdaLabelMentions != null}<span class="excf mono">openFDA label mentions: {e.fdaLabelMentions.toLocaleString()}</span>{/if}
							{#if e.evidence != null}<span class="excp mono">PubMed: {e.evidence.toLocaleString()}</span>{/if}
						</div>
						{#if e.precedent}<div class="excpr mono">precedent · {e.precedent}{#if e.precedentCaveat} <span class="exccav">⚠ {e.precedentCaveat}</span>{/if}</div>{/if}
					</div>
				{/each}
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
			<p class="prov mono">Generated {new Date(dossier.generatedAt).toISOString().slice(0, 16).replace('T', ' ')} · {dossier.provenance?.mode === 'sandbox' ? 'clean-room (seeding + cache OFF)' : 'demo'} · PubChem · ChEMBL · UniProt · PubMed. Molecular identity, binding and literature are live-derived; the target bundle and mechanism are the human-defined hypothesis.</p>
		</section>

		<!-- SAVE & COMPARE -->
		<section class="sec">
			<h3 class="shead display"><span class="sn">06</span> Save &amp; compare</h3>
			<div class="saverow">
				<button class="btn-solid" onclick={saveDossier} disabled={saveState === 'saving'}>
					{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : 'Save this formulation'}
				</button>
				{#if saveState === 'nostore'}<span class="savenote mono">No store configured (set DATABASE_URL) — dossiers still generate live, but can't be saved.</span>{/if}
				{#if saveState === 'error'}<span class="savenote mono err">Save failed — try again.</span>{/if}
			</div>
			{#if saved.length}
				<div class="cmp">
					<div class="cmprow cmphead mono"><span>Species</span><span>Lead</span><span>Route</span><span>Exposure</span><span>Complementarity</span><span>Saved</span></div>
					{#each saved as s}
						<div class="cmprow">
							<span class="cmpsp">{s.species_label}</span>
							<span>{s.lead ?? '—'}</span>
							<span class="mono">{s.route}</span>
							<span class="mono cmpx">~{s.exposure_index}×</span>
							<span class="mono">{Math.round((s.complementarity ?? 0) * 100)}%</span>
							<span class="mono cmpd">{new Date(s.created_at).toISOString().slice(0, 10)}</span>
						</div>
					{/each}
				</div>
				<p class="scap">Saved formulations for this goal + plant — compare exposure and complementarity across versions.</p>
			{/if}
		</section>
	</div>
{:else}
	<div class="wrap"><div class="empty muted">Choose a goal and a plant, then generate a dossier.</div></div>
{/if}

<style>
	/* clean-room / provenance UI */
	.genrow {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		flex-wrap: wrap;
	}
	.sbx {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.72rem;
		color: var(--muted, #8a8a8a);
		cursor: pointer;
		border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
		border-radius: 999px;
		padding: 0.35rem 0.7rem;
		user-select: none;
	}
	.sbx.on {
		color: #7c5cff;
		border-color: #7c5cff;
		background: color-mix(in srgb, #7c5cff 10%, transparent);
	}
	.sbx input {
		accent-color: #7c5cff;
		margin: 0;
	}
	.provbar {
		border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
		border-radius: 10px;
		padding: 0.75rem 0.9rem;
		margin: 0.4rem 0 1rem;
		background: color-mix(in srgb, currentColor 4%, transparent);
	}
	.provbar.sandbox {
		border-color: #7c5cff;
		background: color-mix(in srgb, #7c5cff 8%, transparent);
	}
	.pbhead {
		font-size: 0.74rem;
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		align-items: center;
	}
	.pbmode {
		font-weight: 700;
	}
	.pbdot {
		opacity: 0.4;
	}
	.pbnote {
		font-size: 0.72rem;
		opacity: 0.8;
		margin: 0.4rem 0 0.55rem;
		line-height: 1.5;
	}
	.pblegend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.ptag {
		font-size: 0.64rem;
		font-family: var(--mono, monospace);
		padding: 0.18rem 0.5rem;
		border-radius: 999px;
		border: 1px solid transparent;
		white-space: nowrap;
	}
	.ptag.live {
		color: #1a9e6a;
		border-color: color-mix(in srgb, #1a9e6a 40%, transparent);
		background: color-mix(in srgb, #1a9e6a 10%, transparent);
	}
	.ptag.hyp {
		color: #c2792b;
		border-color: color-mix(in srgb, #c2792b 40%, transparent);
		background: color-mix(in srgb, #c2792b 10%, transparent);
	}
	.ptag.kb {
		color: #5a7bd8;
		border-color: color-mix(in srgb, #5a7bd8 40%, transparent);
		background: color-mix(in srgb, #5a7bd8 10%, transparent);
	}
	.ptag.heur {
		color: #9a8a9a;
		border-color: color-mix(in srgb, #9a8a9a 40%, transparent);
		background: color-mix(in srgb, #9a8a9a 10%, transparent);
	}
	.hypbadge {
		font-size: 0.6rem;
		font-weight: 600;
		color: #c2792b;
		border: 1px solid color-mix(in srgb, #c2792b 40%, transparent);
		background: color-mix(in srgb, #c2792b 10%, transparent);
		border-radius: 999px;
		padding: 0.15rem 0.5rem;
		vertical-align: middle;
		margin-left: 0.5rem;
		letter-spacing: 0;
	}
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
	.fhead {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 1.5rem;
		align-items: stretch;
		margin-bottom: 1.6rem;
	}
	.fexp {
		border: 1px solid var(--jade-line);
		background: var(--jade-soft);
		border-radius: var(--radius);
		padding: 1.1rem 1.3rem;
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-width: 11rem;
	}
	.fexpband {
		font-family: var(--font-mono);
		font-size: 0.56rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		padding: 0.15rem 0.45rem;
		border-radius: 999px;
		width: fit-content;
		margin-bottom: 0.4rem;
		color: #04110b;
	}
	.fexpband.high {
		background: var(--good);
	}
	.fexpband.moderate {
		background: var(--warn);
	}
	.fexpband.low {
		background: var(--bone-faint);
	}
	.fexpn {
		font-family: var(--font-display);
		font-size: 2.6rem;
		line-height: 1;
		color: var(--jade);
	}
	.exccav {
		color: var(--warn);
	}
	.tg.lc {
		border-color: var(--warn);
	}
	.lcm {
		color: var(--warn);
		font-style: normal;
		margin-left: 0.2rem;
	}
	.fexpl {
		font-size: 0.62rem;
		color: var(--bone-dim);
		margin-top: 0.3rem;
	}
	.fexpb {
		font-size: 0.58rem;
		color: var(--brass);
		margin-top: 0.25rem;
	}
	.fcomp {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 1rem 1.2rem;
	}
	.fcov {
		font-size: 0.68rem;
		color: var(--bone);
		margin: 0.3rem 0 0.6rem;
	}
	.fcl {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.fci {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		font-size: 0.74rem;
	}
	.fcname {
		color: var(--bone);
		min-width: 9rem;
	}
	.fctg {
		font-size: 0.6rem;
		color: var(--jade);
	}
	.fcn {
		font-size: 0.64rem;
		color: var(--bone-dim);
		margin: 0.6rem 0 0;
		line-height: 1.45;
	}
	.fdh {
		margin: 1.2rem 0 0.6rem;
	}
	.defs {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.def {
		border-bottom: 1px solid var(--line);
		padding-bottom: 0.55rem;
	}
	.deft {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		font-size: 0.84rem;
		color: var(--bone);
	}
	.defbar {
		flex: 1;
		max-width: 10rem;
		height: 4px;
		background: var(--ink-3);
		border-radius: 3px;
		overflow: hidden;
	}
	.defbar i {
		display: block;
		height: 100%;
		background: var(--warn);
	}
	.defr {
		font-size: 0.66rem;
		color: var(--bone-dim);
		margin-top: 0.25rem;
	}
	.excs {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.9rem;
	}
	.exc {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 0.9rem;
		background: var(--ink-2);
	}
	.exct {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.excn {
		font-size: 0.86rem;
		color: var(--bone);
		font-weight: 500;
	}
	.exccl {
		font-size: 0.56rem;
		text-transform: uppercase;
		color: var(--brass);
		margin-left: auto;
	}
	.excm {
		font-size: 0.72rem;
		color: var(--bone-dim);
		margin: 0.4rem 0 0.5rem;
		line-height: 1.45;
	}
	.excb {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		align-items: center;
	}
	.excd {
		font-size: 0.54rem;
		text-transform: uppercase;
		border: 1px solid var(--line);
		border-radius: 3px;
		padding: 0.1rem 0.35rem;
		color: var(--bone-dim);
	}
	.excf {
		font-size: 0.56rem;
		color: var(--good);
	}
	.excp {
		font-size: 0.56rem;
		color: var(--jade);
	}
	.excpr {
		font-size: 0.6rem;
		color: var(--bone-faint);
		margin-top: 0.5rem;
		font-style: italic;
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
	.saverow {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.savenote {
		font-size: 0.66rem;
		color: var(--bone-dim);
	}
	.savenote.err {
		color: var(--crit);
	}
	.cmp {
		margin-top: 1.2rem;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.cmprow {
		display: grid;
		grid-template-columns: 2fr 1.2fr 0.7fr 0.8fr 1fr 0.9fr;
		gap: 0.7rem;
		padding: 0.6rem 1rem;
		border-bottom: 1px solid var(--line);
		align-items: center;
		font-size: 0.76rem;
		color: var(--bone);
	}
	.cmphead {
		background: var(--ink-1);
		font-size: 0.56rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--brass);
	}
	.cmpsp {
		font-style: italic;
		color: var(--bone);
	}
	.cmpx {
		color: var(--jade);
	}
	.cmpd {
		color: var(--bone-faint);
		font-size: 0.66rem;
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
