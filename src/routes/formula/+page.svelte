<script lang="ts">
	import { onMount } from 'svelte';
	import { loadRDKit, analyze } from '#lib/client/chem';
	import { developability } from '#lib/client/admet';
	import { diagnose, recommend, scoreFormulation, type Diagnosis } from '#lib/client/formulate';
	import { combineTargets, complementarity, mergeDiagnoses, uniqueGenes, type FormulaActive } from '#lib/client/formula';
	import { EVIDENCE_TERMS, type Excipient } from '#lib/data/excipients';

	type FdaExcipient = Excipient & { fdaProducts: number | null };
	type Pathway = { source: string; name: string; fdr: number; genes: string[] };

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let rdkit = $state<any>(null);
	let allActives = $state<FormulaActive[]>([]);
	let fdaById = $state<Record<string, number | null>>({});
	let pickerPlant = $state('turmeric');
	let formula = $state<FormulaActive[]>([]);
	let selectedExc = $state<string[]>([]);
	let pathways = $state<Pathway[] | null>(null);
	let ready = $state(false);

	onMount(async () => {
		const [a, e] = await Promise.all([
			fetch('/api/actives').then((r) => r.json()),
			fetch('/api/excipients').then((r) => r.json())
		]);
		allActives = a?.actives ?? [];
		fdaById = Object.fromEntries(((e?.excipients ?? []) as FdaExcipient[]).map((x) => [x.id, x.fdaProducts]));
		// seed a cross-herb formula to show complementarity immediately
		formula = ['turmeric', 'ashwagandha', 'artemisia']
			.map((s) => allActives.find((x) => x.slug === s))
			.filter((x): x is FormulaActive => !!x);
		ready = true;
		// developability needs RDKit — load it non-blocking; panels fill in when ready
		loadRDKit()
			.then((m) => (rdkit = m))
			.catch(() => {});
	});

	const plants = $derived([...new Map(allActives.map((a) => [a.slug, a.common])).entries()]);
	const pickerActives = $derived(allActives.filter((a) => a.slug === pickerPlant));
	const inFormula = (id: string) => formula.some((f) => f.id === id);

	function toggleActive(a: FormulaActive) {
		formula = inFormula(a.id) ? formula.filter((f) => f.id !== a.id) : [...formula, a];
	}

	const combined = $derived(combineTargets(formula));
	const comp = $derived(complementarity(formula));
	const perActiveDiag = $derived(
		rdkit
			? formula.map((a) => {
					let diagnoses: Diagnosis[] = [];
					if (a.smiles) {
						const d = analyze(rdkit, a.smiles);
						if (d) diagnoses = diagnose(d, developability(d));
					}
					return { name: a.name, diagnoses };
				})
			: []
	);
	const mergedDefs = $derived(mergeDiagnoses(perActiveDiag));
	const recs = $derived(recommend(mergedDefs));
	const score = $derived(scoreFormulation(mergedDefs, selectedExc));

	// pathway enrichment on combined gene set
	$effect(() => {
		const genes = uniqueGenes(formula);
		if (genes.length < 2) {
			pathways = null;
			return;
		}
		const key = genes.slice().sort().join(',');
		let cancelled = false;
		pathways = null;
		fetch(`/api/enrich?genes=${encodeURIComponent(key)}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				if (!cancelled) pathways = d?.pathways ?? [];
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	});

	function toggleExc(id: string) {
		selectedExc = selectedExc.includes(id) ? selectedExc.filter((x) => x !== id) : [...selectedExc, id];
	}
	function autoFormulate() {
		selectedExc = [...new Set(recs.map((r) => r.options[0]?.id).filter(Boolean) as string[])];
	}

	const compLabel = $derived(
		comp.score >= 0.8 ? 'highly complementary' : comp.score >= 0.65 ? 'complementary' : 'overlapping'
	);
	const expPct = (rel: number) => (Math.log10(Math.max(1, rel)) / Math.log10(30)) * 100;
	const plantColor: Record<string, string> = {};
	const palette = ['var(--jade)', 'var(--brass)', 'var(--violet)', '#e0b64a', '#e5705b'];
	$effect(() => {
		plants.forEach(([slug], i) => (plantColor[slug] = palette[i % palette.length]));
	});
</script>

<svelte:head><title>Formula Designer — HERBENZO</title></svelte:head>

<section class="hero">
	<div class="wrap">
		<div class="eyebrow">Phase 2 · Multi-active formula</div>
		<h1 class="display">Design the <em>formula</em>, the way herbs actually work</h1>
		<p class="lede muted">
			Traditional medicine is never one molecule. Combine actives, see whether their targets are
			<em>complementary</em> or redundant, how many pathways the mixture covers, and the single
			excipient system that makes the whole formula bioavailable.
		</p>
	</div>
</section>

<section class="wrap builder">
	<div class="addrow">
		<span class="sellabel mono">Add from</span>
		<div class="ptabs">
			{#each plants as [slug, common]}
				<button class="ptab" class:on={pickerPlant === slug} onclick={() => (pickerPlant = slug)}>{common.replace(/ \(.*\)/, '')}</button>
			{/each}
		</div>
	</div>
	<div class="pick">
		{#each pickerActives as a}
			<button class="pchip" class:on={inFormula(a.id)} onclick={() => toggleActive(a)}>
				{inFormula(a.id) ? '✓' : '+'} {a.name}
			</button>
		{/each}
	</div>
</section>

{#if formula.length}
	<section class="wrap main">
		<div class="left">
			<!-- synergy -->
			<div class="panel">
				<div class="phead">
					<span class="eyebrow">Target coverage &amp; synergy</span>
					<span class="complabel mono" style="color:{comp.score >= 0.65 ? 'var(--good)' : 'var(--warn)'}">{compLabel}</span>
				</div>
				<div class="synmetrics">
					<div class="sm"><div class="smn display">{comp.targets}</div><div class="sml mono">distinct targets</div></div>
					<div class="sm"><div class="smn display">{formula.length}</div><div class="sml mono">actives</div></div>
					<div class="sm"><div class="smn display">{comp.shared}</div><div class="sml mono">shared</div></div>
					<div class="sm"><div class="smn display" style="color:var(--jade)">{(comp.score * 100).toFixed(0)}%</div><div class="sml mono">complementarity</div></div>
				</div>
				<p class="synnote muted">
					{comp.score >= 0.65
						? 'The actives engage largely distinct targets — broad, complementary coverage rather than piling onto the same site.'
						: 'The actives overlap heavily on the same targets — more redundant than synergistic; consider a more diverse active.'}
				</p>
				<div class="tgtlist">
					{#each combined.slice(0, 14) as t}
						<div class="tgtrow" class:shared={t.shared}>
							<span class="tg mono">{t.gene}</span>
							<span class="tn">{t.prefName}</span>
							<span class="tby">
								{#each t.by as name}<i style="background:{plantColor[formula.find((f) => f.name === name)?.slug ?? ''] ?? 'var(--bone-dim)'}" title={name}></i>{/each}
								{#if t.shared}<span class="shtag mono">shared</span>{/if}
							</span>
						</div>
					{/each}
				</div>
			</div>

			<!-- pathways -->
			<div class="panel">
				<span class="eyebrow">Pathway coverage · network pharmacology</span>
				{#if pathways === null}
					<div class="sk pwsk"></div>
				{:else if pathways.length}
					<div class="pways">
						{#each pathways as pw}
							<div class="pw">
								<div class="pwt"><span class="pwsrc mono">{pw.source}</span><span class="pwn">{pw.name}</span><span class="pwf mono">FDR {pw.fdr < 0.001 ? pw.fdr.toExponential(1) : pw.fdr.toFixed(3)}</span></div>
								<div class="pwg">{#each pw.genes as g}<span class="gg mono">{g}</span>{/each}</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="muted">Add actives with ≥2 distinct targets to compute pathway coverage.</p>
				{/if}
			</div>
		</div>

		<!-- right: formula + excipient system -->
		<aside class="right">
			<div class="readout">
				<div class="rohead">
					<span class="eyebrow">The formula</span>
					<button class="auto" onclick={autoFormulate} disabled={!mergedDefs.length}>⚡ Excipient system</button>
				</div>
				<div class="factives">
					{#each formula as a}
						<span class="fchip" style="border-color:{plantColor[a.slug]}">
							<i style="background:{plantColor[a.slug]}"></i>{a.name}
							<button onclick={() => toggleActive(a)} aria-label="remove">✕</button>
						</span>
					{/each}
				</div>

				<div class="expo">
					<div class="expnum display">{score.relExposure > 1 ? '≈ ' + score.relExposure + '×' : '1×'}</div>
					<div class="explab mono">predicted exposure vs. unformulated mix</div>
					<div class="expbar"><i style="width:{expPct(score.relExposure)}%"></i></div>
				</div>

				<div class="defs">
					<div class="dlab mono">Combined deficiencies · {(score.coverage * 100).toFixed(0)}% covered</div>
					{#each mergedDefs as d}
						{@const covered = score.perDeficiency.find((p) => p.deficiency === d.deficiency)?.covered}
						<div class="drow" class:done={covered}>
							<span class="dm">{covered ? '✓' : '○'}</span>
							<span class="dn">{d.label}</span>
							<span class="dby mono">{d.actives.length} active{d.actives.length > 1 ? 's' : ''}</span>
						</div>
					{/each}
					{#if !mergedDefs.length}<div class="drow done"><span class="dm">✓</span><span class="dn">No major deficiencies</span></div>{/if}
				</div>
			</div>
		</aside>
	</section>

	<!-- excipient options -->
	{#if recs.length}
		<section class="wrap excsec">
			<span class="eyebrow">Shared excipient system — one strategy for the whole formula</span>
			<div class="exgrid">
				{#each recs as rec}
					<div class="exgroup">
						<div class="exglab mono">for {rec.deficiency.label.toLowerCase()}</div>
						{#each rec.options.slice(0, 3) as e}
							{@const on = selectedExc.includes(e.id)}
							{@const fda = fdaById[e.id]}
							<button class="exopt" class:on onclick={() => toggleExc(e.id)}>
								<div class="exo-t"><span class="exo-n">{e.name}</span><span class="exo-c">{on ? '✓' : '+'}</span></div>
								<div class="exo-m">{e.mechanism}</div>
								{#if fda != null && fda > 0}<div class="exo-f mono">{fda.toLocaleString()} FDA products</div>{:else}<div class="exo-f mono strat">{e.regulatory}</div>{/if}
							</button>
						{/each}
					</div>
				{/each}
			</div>
			<p class="disc mono">Model estimates for prioritisation — complementarity and exposure are heuristics over open-data targets, pathways and literature. Not claims of clinical synergy or efficacy.</p>
		</section>
	{/if}
{:else}
	<section class="wrap"><p class="muted empty">Add two or more actives to design a formula.</p></section>
{/if}

<style>
	.hero {
		padding-block: 4rem 1.6rem;
		text-align: center;
	}
	.hero h1 {
		font-size: clamp(2rem, 4.5vw, 3.2rem);
		margin: 0.8rem 0 1rem;
		text-wrap: balance;
	}
	.hero h1 em,
	.lede em {
		color: var(--jade);
		font-style: italic;
	}
	.lede {
		max-width: 42rem;
		margin: 0 auto;
		line-height: 1.65;
	}

	.builder {
		padding-block: 0.5rem 1.5rem;
	}
	.addrow {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 0.8rem;
	}
	.sellabel {
		font-size: 0.6rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--brass);
		white-space: nowrap;
	}
	.ptabs,
	.pick {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.ptab {
		background: none;
		border: none;
		color: var(--bone-dim);
		font-size: 0.74rem;
		padding: 0.3rem 0.7rem;
		border-bottom: 2px solid transparent;
	}
	.ptab.on {
		color: var(--jade);
		border-bottom-color: var(--jade);
	}
	.pchip {
		background: var(--ink-2);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--bone-dim);
		font-size: 0.74rem;
		padding: 0.35rem 0.8rem;
	}
	.pchip:hover {
		border-color: var(--line-strong);
		color: var(--bone);
	}
	.pchip.on {
		background: var(--jade-soft);
		border-color: var(--jade-line);
		color: var(--jade);
	}

	.main {
		display: grid;
		grid-template-columns: 1fr 340px;
		gap: 1.4rem;
		align-items: start;
		padding-block: 1rem;
	}
	.panel {
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--ink-1);
		padding: 1.2rem;
		margin-bottom: 1.4rem;
	}
	.phead {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 0.9rem;
	}
	.complabel {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.synmetrics {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.8rem;
		margin-bottom: 0.9rem;
	}
	.smn {
		font-size: 1.7rem;
		line-height: 1;
		color: var(--bone);
	}
	.sml {
		font-size: 0.56rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--bone-faint);
		margin-top: 0.25rem;
	}
	.synnote {
		font-size: 0.8rem;
		line-height: 1.5;
		margin: 0 0 1rem;
	}
	.tgtlist {
		display: flex;
		flex-direction: column;
	}
	.tgtrow {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--line);
		font-size: 0.78rem;
	}
	.tgtrow.shared {
		background: var(--jade-soft);
		margin-inline: -0.4rem;
		padding-inline: 0.4rem;
	}
	.tg {
		color: var(--bone);
		width: 4.5rem;
		flex-shrink: 0;
		font-size: 0.72rem;
	}
	.tn {
		color: var(--bone-dim);
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tby {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}
	.tby i {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		display: inline-block;
	}
	.shtag {
		font-size: 0.54rem;
		color: var(--jade);
		margin-left: 0.3rem;
	}

	.pways {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.pw {
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--line);
	}
	.pwt {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.pwsrc {
		font-size: 0.54rem;
		text-transform: uppercase;
		color: var(--brass);
		width: 4.5rem;
		flex-shrink: 0;
	}
	.pwn {
		font-size: 0.82rem;
		color: var(--bone);
		flex: 1;
		min-width: 0;
	}
	.pwf {
		font-size: 0.58rem;
		color: var(--bone-faint);
	}
	.pwg {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem;
		margin-top: 0.25rem;
	}
	.gg {
		font-size: 0.54rem;
		color: var(--bone-dim);
		border: 1px solid var(--line);
		border-radius: 3px;
		padding: 0.05rem 0.3rem;
	}
	.pwsk {
		height: 120px;
	}

	.right {
		position: sticky;
		top: 5.4rem;
	}
	.readout {
		border: 1px solid var(--line-strong);
		border-radius: 4px;
		background: linear-gradient(180deg, var(--ink-2), var(--ink-1));
		padding: 1.2rem;
	}
	.rohead {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.9rem;
	}
	.auto {
		font-size: 0.6rem;
		background: var(--brass);
		color: var(--ink);
		border: none;
		border-radius: 999px;
		padding: 0.35rem 0.6rem;
		font-weight: 600;
	}
	.auto:disabled {
		opacity: 0.4;
	}
	.factives {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 1rem;
	}
	.fchip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.72rem;
		border: 1px solid;
		border-radius: 999px;
		padding: 0.2rem 0.3rem 0.2rem 0.5rem;
		color: var(--bone);
	}
	.fchip i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.fchip button {
		background: none;
		border: none;
		color: var(--bone-faint);
		font-size: 0.66rem;
	}
	.expo {
		text-align: center;
		padding: 0.4rem 0 1rem;
		border-block: 1px solid var(--line);
		margin-bottom: 0.9rem;
	}
	.expnum {
		font-size: 2.4rem;
		color: var(--jade);
		line-height: 1;
	}
	.explab {
		font-size: 0.54rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--bone-dim);
		margin-top: 0.3rem;
	}
	.expbar {
		height: 6px;
		background: var(--ink-3);
		border-radius: 3px;
		margin-top: 0.7rem;
		overflow: hidden;
	}
	.expbar i {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, var(--brass), var(--jade));
	}
	.dlab {
		font-size: 0.58rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--brass);
		margin-bottom: 0.5rem;
	}
	.drow {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.25rem 0;
		font-size: 0.78rem;
	}
	.dm {
		color: var(--bone-faint);
	}
	.drow.done .dm {
		color: var(--good);
	}
	.dn {
		color: var(--bone);
	}
	.dby {
		margin-left: auto;
		font-size: 0.6rem;
		color: var(--bone-faint);
	}

	.excsec {
		padding-block: 1rem 3rem;
	}
	.exgrid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 1rem;
		margin-top: 0.9rem;
	}
	.exglab {
		font-size: 0.58rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--brass);
		margin-bottom: 0.5rem;
	}
	.exopt {
		display: block;
		width: 100%;
		text-align: left;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--ink-2);
		padding: 0.7rem;
		margin-bottom: 0.5rem;
	}
	.exopt.on {
		border-color: var(--jade-line);
		background: var(--jade-soft);
	}
	.exo-t {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.exo-n {
		font-size: 0.8rem;
		color: var(--bone);
		font-weight: 600;
	}
	.exo-c {
		color: var(--jade);
		font-weight: 700;
	}
	.exo-m {
		font-size: 0.68rem;
		color: var(--bone-dim);
		margin: 0.25rem 0;
		line-height: 1.4;
	}
	.exo-f {
		font-size: 0.58rem;
		color: var(--jade);
	}
	.exo-f.strat {
		color: var(--bone-faint);
	}
	.disc {
		font-size: 0.58rem;
		color: var(--bone-faint);
		line-height: 1.5;
		margin-top: 1.2rem;
	}
	.empty {
		padding: 3rem 0;
		text-align: center;
	}

	@media (max-width: 900px) {
		.main {
			grid-template-columns: 1fr;
		}
		.right {
			position: static;
		}
		.synmetrics {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
