<script lang="ts">
	import { onMount } from 'svelte';
	import { PLANT_INDEX } from '#lib/data/plants';
	import { loadRDKit, analyze, classify } from '#lib/client/chem';
	import type { PlantBase, PlantTargets, CompoundOut, EnrichedCompound, TargetOut } from '#lib/types';
	import CompoundCard from '#lib/components/CompoundCard.svelte';
	import CompoundDetail from '#lib/components/CompoundDetail.svelte';
	import TargetNetwork from '#lib/components/TargetNetwork.svelte';
	import StructureViewer, { type ViewItem } from '#lib/components/StructureViewer.svelte';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let rdkit = $state<any>(null);
	// Base (plant identity + compounds) loads fast; targets stream in after.
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let profile = $state<PlantBase | null>(null);
	let enriched = $state<EnrichedCompound[]>([]);
	let targetsData = $state<PlantTargets | null>(null);
	let targetStatus = $state<'loading' | 'ready' | 'error'>('loading');
	let current = $state(PLANT_INDEX[0].slug);
	let viewerItem = $state<ViewItem | null>(null);
	let detailCompound = $state<EnrichedCompound | null>(null);

	type Pathway = { source: string; name: string; fdr: number; genes: string[]; count: number };
	let pathways = $state<{ pathways: Pathway[]; pathwayCount: number; targets: number } | null>(null);

	function enrich(compounds: CompoundOut[]): EnrichedCompound[] {
		const list: EnrichedCompound[] = compounds.map((c) => {
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
		return list;
	}

	async function selectPlant(slug: string) {
		current = slug;
		status = 'loading';
		profile = null;
		enriched = [];
		targetsData = null;
		targetStatus = 'loading';
		pathways = null;
		try {
			const res = await fetch(`/api/plant/${slug}`);
			if (!res.ok) throw new Error('load failed');
			const base: PlantBase = await res.json();
			if (!rdkit) {
				try {
					rdkit = await loadRDKit();
				} catch {
					/* structures/QED degrade gracefully */
				}
			}
			if (current !== slug) return;
			profile = base;
			enriched = enrich(base.compounds);
			status = 'ready';
			// Heavy layers load independently so neither blocks the page.
			loadTargets(slug);
			loadPathways(slug);
		} catch {
			if (current === slug) status = 'error';
		}
	}

	async function loadTargets(slug: string) {
		targetStatus = 'loading';
		targetsData = null;
		try {
			const r = await fetch(`/api/plant/${slug}/targets`);
			if (!r.ok) throw new Error('targets failed');
			const t: PlantTargets = await r.json();
			if (current !== slug) return;
			targetsData = t;
			// Merge ChEMBL id + per-compound targets back onto the displayed compounds.
			enriched = enriched.map((c) => ({
				...c,
				chemblId: t.compoundChembl?.[c.cid] ?? c.chemblId,
				targets: t.compoundTargets?.[c.cid] ?? c.targets
			}));
			targetStatus = 'ready';
		} catch {
			if (current === slug) targetStatus = 'error';
		}
	}

	function loadPathways(slug: string) {
		fetch(`/api/pathways/${slug}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				if (current === slug) pathways = d;
			})
			.catch(() => {});
	}

	// ── Species search (Phase 2: any LOTUS species, not just the seeded tabs) ──
	type SearchHit = { slug: string; scientific: string; common: string | null; source: string };
	let searchQ = $state('');
	let searchHits = $state<SearchHit[]>([]);
	let searchOpen = $state(false);
	let searchBusy = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	function onSearchInput() {
		clearTimeout(searchTimer);
		const q = searchQ.trim();
		if (q.length < 2) {
			searchHits = [];
			searchOpen = false;
			return;
		}
		searchBusy = true;
		searchTimer = setTimeout(async () => {
			try {
				const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
				const d = await r.json();
				searchHits = d.hits ?? [];
				searchOpen = true;
			} catch {
				searchHits = [];
			} finally {
				searchBusy = false;
			}
		}, 280);
	}

	function pickSearch(slug: string) {
		searchOpen = false;
		searchQ = '';
		searchHits = [];
		selectPlant(slug);
	}

	const maxLogFdr = 12;
	const fdrBar = (fdr: number) => Math.min(100, (-Math.log10(Math.max(fdr, 1e-20)) / maxLogFdr) * 100);
	const sourceColor: Record<string, string> = {
		KEGG: 'var(--jade)',
		Reactome: 'var(--brass)',
		'GO:BP': 'var(--violet)',
		WikiPathways: 'var(--warn)'
	};

	onMount(() => {
		loadRDKit()
			.then((m) => (rdkit = m))
			.catch(() => {})
			.finally(() => selectPlant(current));
	});

	const shown = $derived(enriched.slice(0, 6));
	const stats = $derived(
		profile
			? {
					compounds: profile.compounds.length,
					targets: targetsData ? targetsData.targets.length : null,
					diseases: targetsData
						? new Set(targetsData.targets.flatMap((t) => t.diseases.map((d) => d.id))).size
						: null,
					papers: profile.literature.count
				}
			: null
	);

	function openCompound(c: EnrichedCompound) {
		detailCompound = c;
	}
	function openTarget(t: TargetOut) {
		viewerItem = {
			kind: 'protein',
			accession: t.accession,
			label: t.prefName,
			sub: `${t.gene ?? ''} · ${t.accession}`
		};
	}
	const systemColor: Record<string, string> = {
		Ayurveda: 'var(--jade)',
		TCM: 'var(--brass)',
		Western: 'var(--violet)',
		Unani: 'var(--warn)',
		Siddha: 'var(--good)'
	};
</script>

<svelte:head><title>Explore — HERBENZO</title></svelte:head>

<!-- Hero -->
<section class="hero">
	<div class="wrap">
		<div class="eyebrow">Platform demo · live data</div>
		<h1 class="display">From plant to <em>lead compound</em></h1>
		<p class="lede muted">
			Select a medicinal plant and trace its journey — traditional knowledge, bioactive compounds,
			and the protein targets they engage. Every number is computed live from open scientific
			databases. Convergence across independent traditions is a pharmacological signal.
		</p>
	</div>
</section>

<!-- Selector -->
<div class="selector">
	<div class="wrap selrow">
		<span class="sellabel mono">Choose a plant</span>
		<div class="tabs">
			{#each PLANT_INDEX as p}
				<button class="tab" class:on={current === p.slug} onclick={() => selectPlant(p.slug)}>
					<span class="cn">{p.common.replace(/ \(.*\)/, '')}</span>
					<span class="sci mono">{p.scientific}</span>
				</button>
			{/each}
		</div>
		<div class="search">
			<input
				class="searchin mono"
				type="search"
				placeholder="search any species — e.g. Azadirachta indica"
				bind:value={searchQ}
				oninput={onSearchInput}
				onfocus={() => searchHits.length && (searchOpen = true)}
				onblur={() => setTimeout(() => (searchOpen = false), 160)}
			/>
			{#if searchBusy}<span class="searchspin mono">…</span>{/if}
			{#if searchOpen && searchHits.length}
				<div class="results">
					{#each searchHits as h}
						<button class="res" onclick={() => pickSearch(h.slug)}>
							<span class="rsci">{h.scientific}</span>
							{#if h.common}<span class="rcommon mono">{h.common}</span>{/if}
							<span class="rsrc mono" class:lotus={h.source === 'lotus'}>{h.source}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Live stat strip -->
<div class="statstrip">
	<div class="wrap statrow">
		{#if stats}
			{#each [['compounds', stats.compounds, 'actives surfaced'], ['protein targets', stats.targets, 'ChEMBL + bioactivity'], ['disease links', stats.diseases, 'Open Targets'], ['publications', stats.papers.toLocaleString(), 'PubMed']] as [k, v, sub]}
				<div class="stat rise">
					<div class="num display tnum">{v === null ? '·' : v}</div>
					<div class="k">{k}</div>
					<div class="sub mono">{sub}</div>
				</div>
			{/each}
		{:else}
			{#each Array(4) as _}
				<div class="stat"><div class="sk numsk"></div></div>
			{/each}
		{/if}
		<div class="live mono"><span class="dot"></span> {current}</div>
	</div>
</div>

{#if status === 'error'}
	<div class="wrap"><div class="errbox">Couldn't reach the data services. Try another plant or reload.</div></div>
{/if}

<!-- Section I: Traditional Knowledge -->
<section class="block">
	<div class="wrap">
		<div class="sechead">
			<span class="roman display">I</span>
			<div>
				<h2 class="display">Traditional Knowledge</h2>
				<p class="cap">How independent medical systems documented this plant across centuries</p>
			</div>
		</div>

		{#if profile}
			<div class="plantid rise">
				<div class="nm display">
					{profile.plant.common}<em class="mono">{profile.plant.scientific}</em>
				</div>
				<div class="meta mono">
					{profile.plant.family} · {profile.plant.traditions.length} traditions ·
					<a class="src" href="https://www.wikidata.org" target="_blank" rel="noopener">LOTUS occurrence data</a>
					{#if profile.provenance}
						· <span class="prov">{profile.provenance.store ? 'served from store' : 'live from source'}{#if profile.provenance.fetchedAt} · {new Date(profile.provenance.fetchedAt).toISOString().slice(0, 10)}{/if}</span>
					{/if}
				</div>
				<p class="blurb muted">{profile.plant.blurb}</p>
			</div>
			{#if profile.plant.traditions.length}
				<div class="traditions">
					{#each profile.plant.traditions as t}
						<div class="trad rise" style="--c:{systemColor[t.system] ?? 'var(--jade)'}">
							<h3>{t.system}</h3>
							<ul>
								{#each t.uses as u}<li>{u}</li>{/each}
							</ul>
							{#if t.note}<div class="note mono">{t.note}</div>{/if}
						</div>
					{/each}
				</div>
			{:else}
				<p class="muted notrad">
					On-demand species resolved live from LOTUS — no curated traditional-use records yet.
					The compounds and targets below are computed from open databases exactly as for the
					catalogued plants.
				</p>
			{/if}
		{:else}
			<div class="traditions">
				{#each Array(3) as _}<div class="sk tradsk"></div>{/each}
			</div>
		{/if}
	</div>
</section>

<!-- Section II: Bioactive Compounds -->
<section class="block alt">
	<div class="wrap">
		<div class="sechead">
			<span class="roman display">II</span>
			<div>
				<h2 class="display">Bioactive Compounds</h2>
				<p class="cap">Signature actives with live drug-likeness (RDKit QED), ranked best-first</p>
			</div>
		</div>

		{#if status === 'loading' && !profile}
			<div class="cgrid">
				{#each Array(3) as _}<div class="sk cardsk"></div>{/each}
			</div>
		{:else}
			<div class="cgrid">
				{#each shown as c, i (c.cid)}
					<CompoundCard compound={c} rank={i + 1} onOpen={openCompound} />
				{/each}
			</div>
			<p class="ranknote mono">Ranked by QED drug-likeness · structures & descriptors computed in-browser with RDKit</p>
		{/if}
	</div>
</section>

<!-- Section III: Target Network -->
<section class="block">
	<div class="wrap">
		<div class="sechead">
			<span class="roman display">III</span>
			<div>
				<h2 class="display">Target Network</h2>
				<p class="cap">Protein targets with binding evidence from ChEMBL · disease links from Open Targets</p>
			</div>
		</div>

		{#if targetsData && targetsData.targets.length}
			<div class="netgrid">
				<TargetNetwork
					compounds={shown}
					targets={targetsData.targets}
					edges={targetsData.edges}
					onSelectTarget={openTarget}
				/>
				<div class="legend">
					<div class="ltitle mono">{targetsData.targets.length} protein targets{#if targetsData.partial} · partial{/if}</div>
					<div class="ltlist">
						{#each targetsData.targets as t}
							<button class="lt" onclick={() => openTarget(t)}>
								<div class="ltmain">
									<div class="ltname display">{t.prefName}</div>
									<div class="ltsub mono">{t.gene ?? t.accession}{#if t.diseases[0]} · {t.diseases[0].name}{/if}</div>
								</div>
								<div class="ltscore tnum" style="color:{t.score >= 0.7 ? 'var(--good)' : t.score >= 0.4 ? 'var(--warn)' : 'var(--bone-dim)'}">
									{t.score.toFixed(2)}
								</div>
							</button>
						{/each}
					</div>
					<p class="legnote mono">
						Score ≈ ChEMBL pChEMBL potency (1.00 = highest-confidence binding). Click any target for
						its AlphaFold structure.
					</p>
				</div>
			</div>
		{:else if targetStatus === 'loading'}
			<div class="netloading">
				<div class="sk netsk"></div>
				<p class="loadnote mono"><span class="dot"></span> resolving targets live from ChEMBL · UniProt · Open Targets…</p>
			</div>
		{:else}
			<p class="muted">
				Target data couldn't be resolved right now — ChEMBL/EBI is responding slowly. The compounds
				above are live; reload to retry the target network.
			</p>
		{/if}
	</div>
</section>

<!-- Section IV: Network Pharmacology -->
<section class="block alt">
	<div class="wrap">
		<div class="sechead">
			<span class="roman display">IV</span>
			<div>
				<h2 class="display">Network Pharmacology</h2>
				<p class="cap">The pathways this plant's targets collectively engage — synergy, not a single hit</p>
			</div>
		</div>

		{#if pathways && pathways.pathways.length}
			<p class="synergy rise">
				<b class="tnum">{pathways.targets}</b> targets converge on
				<b class="tnum">{pathways.pathwayCount}</b> enriched pathways — the signature of a
				multi-target, polypharmacological mixture.
			</p>
			<div class="pways">
				{#each pathways.pathways as pw}
					<div class="pw">
						<div class="pwtop">
							<span class="pwsrc mono" style="color:{sourceColor[pw.source] ?? 'var(--bone-dim)'}">{pw.source}</span>
							<span class="pwname">{pw.name}</span>
							<span class="pwfdr mono">FDR {pw.fdr < 0.001 ? pw.fdr.toExponential(1) : pw.fdr.toFixed(3)}</span>
						</div>
						<div class="pwbar"><i style="width:{fdrBar(pw.fdr)}%; background:{sourceColor[pw.source] ?? 'var(--jade)'}"></i></div>
						<div class="pwgenes">
							{#each pw.genes as g}<span class="gchip mono">{g}</span>{/each}
						</div>
					</div>
				{/each}
			</div>
			<p class="ranknote mono">Functional enrichment via STRING (KEGG · Reactome · GO · WikiPathways), FDR-ranked</p>
		{:else if pathways}
			<p class="muted">Not enough targets resolved to compute enrichment for this selection.</p>
		{:else}
			<div class="pways">{#each Array(4) as _}<div class="sk pwsk"></div>{/each}</div>
		{/if}
	</div>
</section>

<!-- CTA -->
<section class="cta">
	<div class="wrap">
		<p class="display">
			This is phase one — discovery. Phase two turns these actives into optimized
			<em>formulations</em>: correlating each API with functional excipients to outperform
			existing preparations.
		</p>
		<div class="ctarow">
			<a href="/how-it-works" class="btn btn-ghost">How it works</a>
			<a href="/" class="btn btn-solid">Back to overview</a>
		</div>
	</div>
</section>

<CompoundDetail
	compound={detailCompound}
	targets={targetsData?.targets ?? []}
	onClose={() => (detailCompound = null)}
/>
<StructureViewer item={viewerItem} onClose={() => (viewerItem = null)} />

<style>
	.hero {
		padding-block: 4rem 2rem;
		text-align: center;
	}
	.hero h1 {
		font-size: clamp(2.4rem, 5vw, 3.8rem);
		margin: 0.8rem 0;
		line-height: 1.02;
		text-wrap: balance;
	}
	.hero h1 em {
		color: var(--jade);
		font-style: italic;
	}
	.lede {
		max-width: 40rem;
		margin: 0 auto;
		font-size: 1rem;
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
		gap: 1.5rem;
		padding-block: 0.8rem;
		overflow-x: auto;
	}
	.sellabel {
		font-size: 0.64rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--brass);
		white-space: nowrap;
	}
	.tabs {
		display: flex;
		gap: 0.3rem;
	}
	.tab {
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		text-align: left;
		padding: 0.4rem 0.9rem;
		white-space: nowrap;
	}
	.tab .cn {
		display: block;
		font-size: 0.78rem;
		color: var(--bone-dim);
		transition: color 0.15s;
	}
	.tab .sci {
		display: block;
		font-size: 0.64rem;
		font-style: italic;
		color: var(--bone-faint);
	}
	.tab:hover .cn {
		color: var(--bone);
	}
	.tab.on {
		border-bottom-color: var(--jade);
	}
	.tab.on .cn {
		color: var(--jade);
	}

	.search {
		position: relative;
		margin-left: auto;
		min-width: 15rem;
		flex-shrink: 0;
	}
	.searchin {
		width: 100%;
		background: var(--ink-2);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.45rem 0.9rem;
		font-size: 0.72rem;
		color: var(--bone);
	}
	.searchin:focus {
		outline: none;
		border-color: var(--jade-line);
		background: var(--ink-1);
	}
	.searchspin {
		position: absolute;
		right: 0.9rem;
		top: 0.5rem;
		color: var(--brass);
		font-size: 0.8rem;
	}
	.results {
		position: absolute;
		top: calc(100% + 0.4rem);
		right: 0;
		left: 0;
		z-index: 50;
		background: var(--ink-1);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius);
		box-shadow: 0 18px 50px -16px rgba(0, 0, 0, 0.7);
		overflow: hidden;
	}
	.res {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		width: 100%;
		text-align: left;
		padding: 0.55rem 0.8rem;
		background: none;
		border: none;
		border-bottom: 1px solid var(--line);
	}
	.res:hover {
		background: var(--jade-soft);
	}
	.rsci {
		font-size: 0.82rem;
		font-style: italic;
		color: var(--bone);
	}
	.rcommon {
		font-size: 0.64rem;
		color: var(--bone-dim);
		flex: 1;
		min-width: 0;
	}
	.rsrc {
		font-size: 0.54rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--brass);
	}
	.rsrc.lotus {
		color: var(--jade);
	}

	.statstrip {
		border-bottom: 1px solid var(--line);
		background: var(--ink-1);
	}
	.statrow {
		display: grid;
		grid-template-columns: repeat(4, 1fr) auto;
		gap: 1rem;
		align-items: center;
		padding-block: 1.3rem;
	}
	.num {
		font-size: 1.9rem;
		line-height: 1;
		color: var(--bone);
	}
	.stat .k {
		font-size: 0.64rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--brass);
		margin-top: 0.35rem;
	}
	.stat .sub {
		font-size: 0.6rem;
		color: var(--bone-faint);
		margin-top: 0.1rem;
	}
	.numsk {
		height: 2.6rem;
		width: 70%;
	}
	.live {
		justify-self: end;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.7rem;
		color: var(--bone-dim);
		text-transform: capitalize;
	}

	.block {
		padding-block: 3.5rem;
	}
	.block.alt {
		background: var(--ink-1);
		border-block: 1px solid var(--line);
	}
	.sechead {
		display: flex;
		align-items: baseline;
		gap: 1.2rem;
		margin-bottom: 2rem;
	}
	.roman {
		font-size: 3rem;
		color: rgba(201, 166, 91, 0.22);
		line-height: 1;
		flex-shrink: 0;
		font-weight: 300;
	}
	.sechead h2 {
		margin: 0;
		font-size: 1.7rem;
		color: var(--bone);
	}
	.cap {
		margin: 0.2rem 0 0;
		font-size: 0.78rem;
		color: var(--brass);
	}

	.plantid {
		margin-bottom: 1.6rem;
	}
	.nm {
		font-size: 1.5rem;
	}
	.nm em {
		font-style: italic;
		color: var(--bone-dim);
		font-size: 1.05rem;
		margin-left: 0.6rem;
	}
	.meta {
		font-size: 0.7rem;
		color: var(--bone-faint);
		margin-top: 0.3rem;
	}
	.meta .src {
		color: var(--brass);
	}
	.meta .prov {
		color: var(--good);
	}
	.blurb {
		max-width: 44rem;
		margin: 0.7rem 0 0;
		font-size: 0.92rem;
	}

	.traditions {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.2rem;
	}
	.trad {
		border: 1px solid var(--line);
		border-top: 2px solid var(--c);
		border-radius: var(--radius);
		padding: 1.2rem;
		background: var(--ink-2);
	}
	.trad h3 {
		margin: 0 0 0.9rem;
		font-size: 0.72rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--c);
	}
	.trad ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.trad li {
		font-size: 0.86rem;
		padding-left: 1rem;
		position: relative;
		color: var(--bone);
	}
	.trad li::before {
		content: '—';
		position: absolute;
		left: 0;
		color: var(--c);
		opacity: 0.7;
	}
	.trad .note {
		margin-top: 0.8rem;
		font-size: 0.66rem;
		font-style: italic;
		color: var(--bone-faint);
	}
	.tradsk {
		height: 190px;
	}

	.cgrid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.2rem;
	}
	.cardsk {
		height: 380px;
	}
	.ranknote {
		margin-top: 1.2rem;
		font-size: 0.66rem;
		color: var(--bone-faint);
		text-align: right;
	}

	.netgrid {
		display: grid;
		grid-template-columns: 1.4fr 1fr;
		gap: 1.6rem;
		align-items: start;
	}
	.netsk {
		height: 460px;
	}
	.netloading {
		position: relative;
	}
	.loadnote {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-size: 0.72rem;
		color: var(--bone-dim);
		text-align: center;
		padding: 1rem;
	}
	.legend {
		display: flex;
		flex-direction: column;
	}
	.ltitle {
		font-size: 0.64rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brass);
		margin-bottom: 0.6rem;
	}
	.ltlist {
		display: flex;
		flex-direction: column;
		max-height: 420px;
		overflow-y: auto;
	}
	.lt {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		padding: 0.7rem 0.3rem;
		border: none;
		border-bottom: 1px solid var(--line);
		background: none;
		text-align: left;
		transition: background 0.15s;
	}
	.lt:hover {
		background: var(--jade-soft);
	}
	.ltname {
		font-size: 1rem;
		color: var(--bone);
	}
	.ltsub {
		font-size: 0.64rem;
		color: var(--bone-dim);
		margin-top: 0.1rem;
	}
	.ltscore {
		font-family: var(--font-mono);
		font-size: 1.05rem;
	}
	.legnote {
		font-size: 0.62rem;
		color: var(--bone-faint);
		margin-top: 0.8rem;
		line-height: 1.5;
	}

	.synergy {
		font-size: 1rem;
		color: var(--bone);
		max-width: 44rem;
		margin: 0 0 1.6rem;
		line-height: 1.6;
	}
	.synergy b {
		color: var(--jade);
		font-family: var(--font-mono);
	}
	.pways {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.7rem 1.4rem;
	}
	.pw {
		padding: 0.7rem 0;
		border-bottom: 1px solid var(--line);
	}
	.pwtop {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
	}
	.pwsrc {
		font-size: 0.56rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		width: 5.5rem;
		flex-shrink: 0;
	}
	.pwname {
		font-size: 0.86rem;
		color: var(--bone);
		flex: 1;
		min-width: 0;
	}
	.pwfdr {
		font-size: 0.6rem;
		color: var(--bone-faint);
		white-space: nowrap;
	}
	.pwbar {
		height: 3px;
		background: var(--ink-3);
		border-radius: 3px;
		overflow: hidden;
		margin: 0.4rem 0;
	}
	.pwbar i {
		display: block;
		height: 100%;
	}
	.pwgenes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.gchip {
		font-size: 0.58rem;
		color: var(--bone-dim);
		border: 1px solid var(--line);
		border-radius: 3px;
		padding: 0.1rem 0.35rem;
	}
	.pwsk {
		height: 70px;
	}

	.cta {
		padding-block: 4rem;
		border-top: 1px solid var(--line);
		text-align: center;
	}
	.cta p {
		max-width: 42rem;
		margin: 0 auto 1.8rem;
		font-size: 1.2rem;
		font-style: italic;
		color: var(--bone-dim);
		line-height: 1.5;
	}
	.cta em {
		color: var(--jade);
	}
	.ctarow {
		display: flex;
		gap: 0.8rem;
		justify-content: center;
		flex-wrap: wrap;
	}

	.errbox {
		border: 1px solid var(--crit);
		color: var(--crit);
		padding: 1rem;
		border-radius: var(--radius);
		margin-top: 1rem;
		font-size: 0.85rem;
	}

	@media (max-width: 820px) {
		.statrow {
			grid-template-columns: repeat(2, 1fr);
		}
		.live {
			display: none;
		}
		.netgrid,
		.pways {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 680px) {
		.traditions,
		.cgrid {
			grid-template-columns: 1fr;
		}
		.selector {
			top: 4.2rem;
		}
	}
</style>
