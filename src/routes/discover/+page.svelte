<script lang="ts">
	import { onMount } from 'svelte';

	type Suggestion = { key: string; label: string; n: number };
	type Hit = { slug: string; common: string; scientific: string; via: string; score: number };
	type Convergent = {
		theme: string;
		entries: { slug: string; common: string; system: string }[];
		traditions: number;
		plants: number;
	};

	let mode = $state<'target' | 'disease' | 'compound'>('disease');
	let q = $state('');
	let idx = $state<{
		genes: Suggestion[];
		diseases: Suggestion[];
		compounds: Suggestion[];
		convergence: Convergent[];
	} | null>(null);
	let hits = $state<Hit[] | null>(null);
	let searching = $state(false);
	let resolvedQ = $state('');

	onMount(async () => {
		try {
			const r = await fetch('/api/discover');
			idx = await r.json();
		} catch {
			/* ignore */
		}
	});

	const suggestions = $derived(
		mode === 'target' ? (idx?.genes ?? []) : mode === 'disease' ? (idx?.diseases ?? []) : (idx?.compounds ?? [])
	);

	async function run(term: string) {
		const t = term.trim();
		if (!t) return;
		q = t;
		searching = true;
		hits = null;
		try {
			const r = await fetch(`/api/discover/search?mode=${mode}&q=${encodeURIComponent(t)}`);
			const d = await r.json();
			hits = d.hits;
			resolvedQ = d.q;
		} catch {
			hits = [];
		} finally {
			searching = false;
		}
	}
	function setMode(m: typeof mode) {
		mode = m;
		hits = null;
		q = '';
	}
	const modeLabel = { target: 'protein / gene', disease: 'disease', compound: 'compound' } as const;
	const systemColor: Record<string, string> = {
		Ayurveda: 'var(--jade)',
		TCM: 'var(--brass)',
		Western: 'var(--violet)',
		Unani: 'var(--warn)'
	};
</script>

<svelte:head><title>Discover — HERBENZO</title></svelte:head>

<section class="hero">
	<div class="wrap">
		<div class="eyebrow">Reverse &amp; convergence search</div>
		<h1 class="display">Start from the <em>target</em>, not the plant</h1>
		<p class="lede muted">
			Ask it backwards: which herbs engage a protein, address a disease, or contain a compound — and
			where independent traditions <em>converge</em> on the same indication. Built live across the
			catalogue.
		</p>
	</div>
</section>

<section class="wrap tool">
	<div class="modes">
		{#each ['disease', 'target', 'compound'] as const as m}
			<button class="mode" class:on={mode === m} onclick={() => setMode(m)}>
				by {modeLabel[m]}
			</button>
		{/each}
	</div>

	<form
		class="searchbar"
		onsubmit={(e) => {
			e.preventDefault();
			run(q);
		}}
	>
		<input
			list="sugg"
			bind:value={q}
			placeholder={mode === 'target' ? 'e.g. RELA, PTGS2, MAOB' : mode === 'disease' ? 'e.g. Alzheimer disease, osteoarthritis' : 'e.g. curcumin, quercetin'}
			aria-label="Search {modeLabel[mode]}"
		/>
		<datalist id="sugg">
			{#each suggestions as s}<option value={s.key}>{s.label} · {s.n} herb{s.n > 1 ? 's' : ''}</option>{/each}
		</datalist>
		<button type="submit" class="btn btn-solid">Search</button>
	</form>

	<div class="chips">
		<span class="chlab mono">try:</span>
		{#each suggestions.slice(0, 10) as s}
			<button class="chip" onclick={() => run(s.key)}>{s.label} <i>{s.n}</i></button>
		{/each}
	</div>

	<!-- results -->
	{#if searching}
		<div class="results">
			{#each Array(2) as _}<div class="sk hitsk"></div>{/each}
		</div>
	{:else if hits}
		{#if hits.length}
			<div class="rhead mono">
				{hits.length} herb{hits.length > 1 ? 's' : ''} for <b>{resolvedQ}</b>
			</div>
			<div class="results">
				{#each hits as h}
					<a class="hit" href="/explore">
						<div class="hmain">
							<div class="hname display">{h.common}</div>
							<div class="hsci mono">{h.scientific}</div>
							<div class="hvia">via <b>{h.via}</b></div>
						</div>
						<div class="hscore tnum" style="color:{h.score >= 0.7 ? 'var(--good)' : h.score >= 0.4 ? 'var(--warn)' : 'var(--bone-dim)'}">
							{h.score.toFixed(2)}
						</div>
					</a>
				{/each}
			</div>
		{:else}
			<div class="empty muted">No herb in the catalogue connects to <b>{resolvedQ}</b>. Try a suggested term.</div>
		{/if}
	{/if}
</section>

<!-- convergence -->
<section class="wrap conv">
	<div class="shead">
		<span class="n fd">◆</span>
		<div>
			<h2 class="display">Cross-tradition convergence</h2>
			<p class="cap">Indications documented by independent systems — convergence as a pharmacological signal</p>
		</div>
	</div>
	{#if idx}
		<div class="cgrid">
			{#each idx.convergence as c}
				<div class="cvcard">
					<div class="cvtop">
						<h3 class="display">{c.theme}</h3>
						<span class="cvcount mono">{c.traditions}&times; traditions</span>
					</div>
					<div class="cventries">
						{#each c.entries as e}
							<span class="ent" style="--c:{systemColor[e.system] ?? 'var(--bone-dim)'}">
								{e.common.replace(/ \(.*\)/, '')} · {e.system}
							</span>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="cgrid">{#each Array(4) as _}<div class="sk cvsk"></div>{/each}</div>
	{/if}
</section>

<style>
	.hero {
		padding-block: 4.5rem 2rem;
		text-align: center;
	}
	.hero h1 {
		font-size: clamp(2.2rem, 5vw, 3.4rem);
		margin: 0.8rem 0 1rem;
		text-wrap: balance;
	}
	.hero h1 em,
	.lede em {
		color: var(--jade);
		font-style: italic;
	}
	.lede {
		max-width: 40rem;
		margin: 0 auto;
		line-height: 1.65;
	}

	.tool {
		padding-block: 1rem 3rem;
	}
	.modes {
		display: flex;
		gap: 0.3rem;
		border-bottom: 1px solid var(--line);
		margin-bottom: 1.4rem;
	}
	.mode {
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--bone-dim);
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		padding: 0.6rem 1rem;
		text-transform: capitalize;
	}
	.mode.on {
		color: var(--jade);
		border-bottom-color: var(--jade);
	}
	.mode:hover {
		color: var(--bone);
	}

	.searchbar {
		display: flex;
		gap: 0.6rem;
	}
	.searchbar input {
		flex: 1;
		min-width: 0;
		background: var(--ink-2);
		border: 1px solid var(--line-strong);
		border-radius: 4px;
		color: var(--bone);
		font-family: var(--font-mono);
		font-size: 0.9rem;
		padding: 0.8rem 1rem;
	}
	.searchbar input:focus {
		outline: none;
		border-color: var(--jade-line);
	}

	.chips {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-top: 0.9rem;
	}
	.chlab {
		font-size: 0.64rem;
		color: var(--bone-faint);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.chip {
		background: var(--ink-2);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--bone-dim);
		font-size: 0.72rem;
		padding: 0.3rem 0.7rem;
	}
	.chip i {
		color: var(--brass);
		font-style: normal;
		font-family: var(--font-mono);
		font-size: 0.6rem;
	}
	.chip:hover {
		border-color: var(--jade-line);
		color: var(--jade);
	}

	.rhead {
		font-size: 0.72rem;
		color: var(--bone-dim);
		margin: 1.8rem 0 0.8rem;
	}
	.rhead b {
		color: var(--jade);
	}
	.results {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 0.8rem;
	}
	.hit {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 1rem 1.1rem;
		background: var(--ink-2);
		transition:
			border-color 0.18s,
			transform 0.18s;
	}
	.hit:hover {
		border-color: var(--jade-line);
		transform: translateY(-2px);
	}
	.hname {
		font-size: 1.15rem;
		color: var(--bone);
	}
	.hsci {
		font-size: 0.64rem;
		font-style: italic;
		color: var(--bone-faint);
	}
	.hvia {
		font-size: 0.72rem;
		color: var(--bone-dim);
		margin-top: 0.4rem;
	}
	.hvia b {
		color: var(--bone);
		font-family: var(--font-mono);
		font-size: 0.68rem;
	}
	.hscore {
		font-family: var(--font-mono);
		font-size: 1.3rem;
	}
	.hitsk {
		height: 90px;
	}
	.empty {
		margin-top: 1.8rem;
		padding: 1.4rem;
		border: 1px dashed var(--line-strong);
		border-radius: 4px;
		font-size: 0.9rem;
	}

	.conv {
		padding-block: 2rem 4rem;
		border-top: 1px solid var(--line);
	}
	.shead {
		display: flex;
		gap: 0.9rem;
		align-items: baseline;
		margin-bottom: 1.6rem;
	}
	.shead .n {
		color: var(--brass);
		opacity: 0.6;
	}
	.shead h2 {
		margin: 0;
		font-size: 1.5rem;
	}
	.cap {
		margin: 0.2rem 0 0;
		font-size: 0.78rem;
		color: var(--brass);
	}
	.cgrid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 1rem;
	}
	.cvcard {
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 1.1rem;
		background: var(--ink-2);
	}
	.cvtop {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.8rem;
	}
	.cvtop h3 {
		margin: 0;
		font-size: 1.2rem;
		color: var(--jade);
		text-transform: capitalize;
	}
	.cvcount {
		font-size: 0.6rem;
		color: var(--brass);
		white-space: nowrap;
	}
	.cventries {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.ent {
		font-size: 0.72rem;
		color: var(--bone);
		padding-left: 0.7rem;
		border-left: 2px solid var(--c);
	}
	.cvsk {
		height: 150px;
	}
</style>
