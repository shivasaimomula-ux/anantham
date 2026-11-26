<script lang="ts">
	import type { EnrichedCompound, TargetOut } from '#lib/types';
	import { developability, solMgMlLabel } from '#lib/client/admet';

	let {
		compound,
		targets,
		onClose
	}: { compound: EnrichedCompound | null; targets: TargetOut[]; onClose: () => void } = $props();

	let host: HTMLDivElement | undefined = $state();
	let vstatus = $state<'loading' | 'ready' | 'error'>('loading');
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let viewer: any = null;

	const dev = $derived(compound?.desc ? developability(compound.desc) : null);
	const tmap = $derived(new Map(targets.map((t) => [t.accession, t])));
	const bcsColor = (c: string) =>
		c === 'I' ? 'var(--good)' : c === 'IV' ? 'var(--crit)' : 'var(--warn)';

	async function render3d(cid: number) {
		vstatus = 'loading';
		try {
			const mol3d = await import('3dmol');
			if (!host) return;
			host.innerHTML = '';
			viewer = mol3d.createViewer(host, { backgroundColor: '#0a1511' });
			const r = await fetch(`/api/structure/${cid}`);
			if (!r.ok) throw new Error('no 3D');
			viewer.addModel(await r.text(), 'sdf');
			viewer.setStyle({}, { stick: { radius: 0.13, colorscheme: 'Jmol' }, sphere: { scale: 0.25 } });
			viewer.zoomTo();
			viewer.render();
			viewer.spin('y');
			vstatus = 'ready';
		} catch {
			vstatus = 'error';
		}
	}

	$effect(() => {
		if (compound) render3d(compound.cid);
		else {
			viewer = null;
		}
	});

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window on:keydown={onKey} />

{#if compound}
	<div class="overlay" onclick={onClose} role="button" tabindex="-1" aria-label="Close">
		<div class="panel" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<header>
				<div class="hleft">
					<span class="eyebrow">Developability dossier</span>
					<h2 class="display">{compound.name}</h2>
					<div class="sub mono">
						{compound.formula ?? ''} · CID {compound.cid}{#if compound.chemblId} · {compound.chemblId}{/if}
					</div>
				</div>
				{#if compound.qedClass}
					<span class="qbadge {compound.qedClass.split('-')[0]}">{compound.qedClass} · QED {compound.desc?.qed.toFixed(2)}</span>
				{/if}
				<button class="close" onclick={onClose} aria-label="Close">✕</button>
			</header>

			<div class="grid">
				<!-- left: structures -->
				<div class="viz">
					<div class="viewer" bind:this={host}></div>
					{#if vstatus === 'loading'}<div class="vstate mono">loading 3D…</div>{/if}
					{#if vstatus === 'error'}<div class="vstate mono err">3D unavailable</div>{/if}
					{#if compound.desc?.svg}
						<div class="twod">{@html compound.desc.svg}</div>
					{/if}
					<div class="vcap mono">3D: PubChem conformer · 2D: RDKit</div>
				</div>

				<!-- right: ADMET -->
				<div class="admet">
					{#if dev}
						<!-- headline developability -->
						<div class="head4">
							<div class="hc">
								<div class="hlab mono">Est. BCS class</div>
								<div class="bcs" style="color:{bcsColor(dev.bcs.class)}">{dev.bcs.class}</div>
							</div>
							<div class="hc">
								<div class="hlab mono">Aq. solubility</div>
								<div class="hval">{solMgMlLabel(dev.solMgMl)}</div>
								<div class="hsub mono">logS {dev.logS} · {dev.solLabel}</div>
							</div>
							<div class="hc">
								<div class="hlab mono">GI absorption</div>
								<div class="hval" style="color:{dev.gi === 'High' ? 'var(--good)' : 'var(--warn)'}">{dev.gi}</div>
							</div>
							<div class="hc">
								<div class="hlab mono">BBB</div>
								<div class="hval" style="color:{dev.bbb === 'Likely' ? 'var(--violet)' : 'var(--bone-dim)'}">{dev.bbb}</div>
							</div>
						</div>

						<div class="implication">
							<span class="mono tag">formulation implication</span>
							{dev.bcs.note}.
						</div>

						<!-- drug-likeness filters -->
						<div class="block">
							<div class="blab mono">Drug-likeness filters · {dev.passCount}/5 pass</div>
							<div class="rules">
								{#each dev.rules as r}
									<div class="rule" class:pass={r.pass} title={r.detail}>
										<span class="rmark">{r.pass ? '✓' : '✕'}</span>{r.name}
									</div>
								{/each}
							</div>
						</div>

						<!-- physchem recap -->
						<div class="block">
							<div class="blab mono">Physicochemistry</div>
							<div class="pc">
								<span>MW <b class="tnum">{compound.desc?.mw.toFixed(1)}</b></span>
								<span>cLogP <b class="tnum">{compound.desc?.alogp.toFixed(2)}</b></span>
								<span>TPSA <b class="tnum">{compound.desc?.psa.toFixed(0)}</b></span>
								<span>HBD/HBA <b class="tnum">{compound.desc?.hbd}/{compound.desc?.hba}</b></span>
								<span>RotB <b class="tnum">{compound.desc?.rotb}</b></span>
								<span>F% <b class="tnum">{dev.bioavailabilityScore}</b></span>
								<span>Fsp³ <b class="tnum">{compound.desc?.fractionCsp3.toFixed(2)}</b></span>
								<span>alerts <b class="tnum">{compound.desc?.alerts}</b></span>
							</div>
						</div>

						<!-- targets -->
						{#if compound.targets.length}
							<div class="block">
								<div class="blab mono">Engages {compound.targets.length} target{compound.targets.length > 1 ? 's' : ''}</div>
								<div class="tgts">
									{#each compound.targets as ct}
										{@const t = tmap.get(ct.accession)}
										<span class="tgt">
											{t?.prefName ?? ct.accession}
											<i class="mono" style="color:{ct.score >= 0.7 ? 'var(--good)' : ct.score >= 0.4 ? 'var(--warn)' : 'var(--bone-dim)'}">{ct.score.toFixed(2)}</i>
										</span>
									{/each}
								</div>
							</div>
						{/if}
					{:else}
						<div class="vstate mono">computing descriptors…</div>
					{/if}
				</div>
			</div>

			<footer class="mono">
				Models: ESOL (Delaney 2004) · Lipinski/Veber/Ghose/Egan/Muegge · Abbott bioavailability · BCS
				estimated from solubility × permeability. Estimates for prioritisation, not measured values.
			</footer>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: rgba(3, 8, 6, 0.76);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		animation: fade 0.2s ease both;
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	.panel {
		width: min(880px, 97vw);
		max-height: 94vh;
		overflow-y: auto;
		background: var(--ink-1);
		border: 1px solid var(--line-strong);
		border-radius: 4px;
		box-shadow: 0 30px 90px -20px rgba(0, 0, 0, 0.9);
	}
	header {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 1.2rem 1.4rem;
		border-bottom: 1px solid var(--line);
		position: sticky;
		top: 0;
		background: var(--ink-1);
		z-index: 2;
	}
	.hleft {
		flex: 1;
	}
	.eyebrow {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--brass);
	}
	header h2 {
		margin: 0.2rem 0 0.1rem;
		font-size: 1.5rem;
		color: var(--bone);
	}
	.sub {
		font-size: 0.68rem;
		color: var(--bone-dim);
	}
	.qbadge {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 0.3rem 0.6rem;
		border-radius: 999px;
		height: fit-content;
		color: #04110b;
	}
	.qbadge.drug {
		background: var(--good);
	}
	.qbadge.lead {
		background: var(--warn);
	}
	.qbadge.fragment {
		background: #d59b8c;
	}
	.close {
		background: var(--ink-3);
		border: 1px solid var(--line);
		color: var(--bone-dim);
		border-radius: 4px;
		width: 2rem;
		height: 2rem;
		flex-shrink: 0;
	}
	.close:hover {
		color: var(--jade);
	}

	.grid {
		display: grid;
		grid-template-columns: 300px 1fr;
		gap: 0;
	}
	.viz {
		border-right: 1px solid var(--line);
		display: flex;
		flex-direction: column;
	}
	.viewer {
		height: 260px;
		background: #0a1511;
		position: relative;
	}
	.vstate {
		padding: 1rem;
		font-size: 0.75rem;
		color: var(--bone-dim);
		text-align: center;
	}
	.vstate.err {
		color: var(--warn);
	}
	.twod {
		background: radial-gradient(circle at 50% 40%, #fbf7ec, #ece3cf);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.6rem;
		min-height: 150px;
	}
	.twod :global(svg) {
		max-width: 90%;
		max-height: 150px;
	}
	.vcap {
		font-size: 0.56rem;
		color: var(--bone-faint);
		padding: 0.5rem 0.7rem;
		border-top: 1px solid var(--line);
	}

	.admet {
		padding: 1.2rem 1.4rem;
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}
	.head4 {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.8rem;
	}
	.hc {
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 0.7rem;
		background: var(--ink-2);
	}
	.hlab {
		font-size: 0.56rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--bone-faint);
	}
	.bcs {
		font-family: var(--font-display);
		font-size: 2rem;
		line-height: 1.1;
	}
	.hval {
		font-size: 1.05rem;
		font-weight: 600;
		color: var(--bone);
		margin-top: 0.2rem;
	}
	.hsub {
		font-size: 0.6rem;
		color: var(--bone-dim);
		margin-top: 0.15rem;
	}

	.implication {
		font-size: 0.85rem;
		color: var(--bone);
		border-left: 2px solid var(--jade);
		padding: 0.5rem 0 0.5rem 0.9rem;
		background: var(--jade-soft);
		border-radius: 0 4px 4px 0;
	}
	.implication .tag {
		display: block;
		font-size: 0.56rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--jade);
		margin-bottom: 0.2rem;
	}

	.block .blab {
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--brass);
		margin-bottom: 0.6rem;
	}
	.rules {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.rule {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.74rem;
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--crit);
		color: var(--crit);
		border-radius: 999px;
		background: rgba(229, 112, 91, 0.08);
	}
	.rule.pass {
		border-color: var(--jade-line);
		color: var(--jade);
		background: var(--jade-soft);
	}
	.rmark {
		font-weight: 700;
	}

	.pc {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.5rem 1rem;
	}
	.pc span {
		font-size: 0.72rem;
		color: var(--bone-dim);
		display: flex;
		justify-content: space-between;
		border-bottom: 1px dotted var(--line);
		padding-bottom: 0.2rem;
	}
	.pc b {
		color: var(--bone);
		font-family: var(--font-mono);
	}

	.tgts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.tgt {
		font-size: 0.74rem;
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 0.3rem 0.55rem;
		color: var(--bone);
		display: inline-flex;
		gap: 0.5rem;
		align-items: center;
	}

	footer {
		padding: 0.8rem 1.4rem;
		border-top: 1px solid var(--line);
		font-size: 0.58rem;
		color: var(--bone-faint);
		line-height: 1.5;
	}

	@media (max-width: 720px) {
		.grid {
			grid-template-columns: 1fr;
		}
		.viz {
			border-right: 0;
			border-bottom: 1px solid var(--line);
		}
		.head4 {
			grid-template-columns: repeat(2, 1fr);
		}
		.pc {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
