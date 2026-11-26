<script lang="ts">
	import type { EnrichedCompound } from '#lib/types';
	import QedGauge from './QedGauge.svelte';

	let {
		compound,
		rank,
		onOpen
	}: { compound: EnrichedCompound; rank: number; onOpen: (c: EnrichedCompound) => void } = $props();

	const d = $derived(compound.desc);
	const cls = $derived(compound.qedClass ?? '');
	const fmt = (n: number | null | undefined, dp = 1) =>
		n === null || n === undefined ? '—' : n.toFixed(dp);
</script>

<article
	class="card"
	class:loading={!d}
	onclick={() => onOpen(compound)}
	onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(compound))}
	role="button"
	tabindex="0"
	aria-label="Open developability dossier for {compound.name}"
>
	<div class="struct">
		<span class="rank mono">{String(rank).padStart(2, '0')}</span>
		{#if cls}
			<span class="badge {cls.split('-')[0]}">{cls}</span>
		{/if}
		{#if d?.svg}
			<!-- RDKit-rendered 2D structure (eslint-disable-next-line svelte/no-at-html-tags) -->
			<div class="svgwrap">{@html d.svg}</div>
		{:else}
			<div class="sk svgsk"></div>
		{/if}
		<span class="view3d" title="Developability dossier">dossier →</span>
	</div>

	<div class="body">
		<div class="head">
			<h3 class="name display" title={compound.iupac ?? compound.name}>{compound.name}</h3>
			<span class="formula mono">{compound.formula ?? ''}</span>
		</div>

		<div class="metrics">
			{#if d}
				<QedGauge value={d.qed} size={116} />
			{:else}
				<div class="sk gaugesk"></div>
			{/if}
			<dl class="props">
				<div><dt>MW</dt><dd class="tnum">{fmt(compound.mw)}</dd></div>
				<div><dt>cLogP</dt><dd class="tnum">{fmt(d?.alogp ?? compound.xlogp)}</dd></div>
				<div><dt>TPSA</dt><dd class="tnum">{fmt(d?.psa ?? compound.tpsa)}</dd></div>
				<div><dt>HBD / HBA</dt><dd class="tnum">{d ? `${d.hbd} / ${d.hba}` : '—'}</dd></div>
				<div><dt>Rot. bonds</dt><dd class="tnum">{d ? d.rotb : '—'}</dd></div>
				<div>
					<dt>Lipinski</dt>
					<dd class="tnum" class:flag={!!d && d.lipinskiViolations > 0}>
						{d ? (d.lipinskiViolations === 0 ? 'pass' : `${d.lipinskiViolations} viol.`) : '—'}
					</dd>
				</div>
			</dl>
		</div>

		<div class="foot">
			<span class="chip"><b class="tnum">{compound.targets.length}</b> targets</span>
			<span class="chip"><b class="tnum">{compound.literature.toLocaleString()}</b> papers</span>
			{#if d}<span class="chip alerts" class:warn={d.alerts > 2}><b class="tnum">{d.alerts}</b> alerts</span>{/if}
			<a
				class="cid mono"
				href="https://pubchem.ncbi.nlm.nih.gov/compound/{compound.cid}"
				target="_blank"
				rel="noopener"
				onclick={(e) => e.stopPropagation()}>CID {compound.cid} ↗</a
			>
		</div>
	</div>
</article>

<style>
	.card {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: linear-gradient(180deg, var(--ink-2), var(--ink-1));
		overflow: hidden;
		cursor: pointer;
		transition:
			border-color 0.2s,
			transform 0.2s,
			box-shadow 0.2s;
	}
	.card:hover {
		border-color: var(--line-strong);
		transform: translateY(-3px);
		box-shadow: 0 12px 30px -16px rgba(0, 0, 0, 0.8);
	}

	.struct {
		position: relative;
		height: 150px;
		background:
			radial-gradient(circle at 50% 40%, #fbf7ec, #ece3cf);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.svgwrap {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.svgwrap :global(svg) {
		max-width: 92%;
		max-height: 92%;
	}
	.svgsk {
		width: 80%;
		height: 70%;
		background: rgba(0, 0, 0, 0.06);
	}
	.rank {
		position: absolute;
		top: 8px;
		left: 10px;
		font-size: 0.7rem;
		color: rgba(20, 30, 20, 0.45);
		font-weight: 500;
	}
	.badge {
		position: absolute;
		top: 8px;
		right: 10px;
		font-family: var(--font-mono);
		font-size: 0.56rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 0.2rem 0.45rem;
		border-radius: 999px;
		font-weight: 500;
		color: #062016;
	}
	.badge.drug {
		background: var(--good);
	}
	.badge.lead {
		background: var(--warn);
	}
	.badge.fragment {
		background: #d59b8c;
	}
	.view3d {
		position: absolute;
		bottom: 8px;
		right: 10px;
		font-family: var(--font-mono);
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		background: rgba(6, 14, 11, 0.82);
		color: var(--jade);
		border: 1px solid var(--jade-line);
		border-radius: 999px;
		padding: 0.25rem 0.55rem;
		opacity: 0;
		transition: opacity 0.2s;
	}
	.card:hover .view3d {
		opacity: 1;
	}

	.body {
		padding: 1rem 1.1rem 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
	}
	.name {
		font-size: 1.22rem;
		line-height: 1.1;
		margin: 0;
		color: var(--bone);
	}
	.formula {
		font-size: 0.68rem;
		color: var(--bone-faint);
		white-space: nowrap;
	}

	.metrics {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 1rem;
		align-items: center;
	}
	.gaugesk {
		width: 116px;
		height: 74px;
	}
	.props {
		margin: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.3rem 1rem;
	}
	.props div {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		border-bottom: 1px dotted var(--line);
		padding-bottom: 0.15rem;
	}
	.props dt {
		font-size: 0.68rem;
		color: var(--bone-faint);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.props dd {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.76rem;
		color: var(--bone);
	}
	.props dd.flag {
		color: var(--warn);
	}

	.foot {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		border-top: 1px solid var(--line);
		padding-top: 0.8rem;
	}
	.chip {
		font-size: 0.68rem;
		color: var(--bone-dim);
	}
	.chip b {
		color: var(--bone);
		font-family: var(--font-mono);
	}
	.chip.alerts.warn b {
		color: var(--warn);
	}
	.cid {
		margin-left: auto;
		font-size: 0.64rem;
		color: var(--bone-faint);
	}
	.cid:hover {
		color: var(--jade);
	}
</style>
