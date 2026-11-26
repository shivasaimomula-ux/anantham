<script lang="ts">
	export type ViewItem =
		| { kind: 'compound'; cid: number; label: string; sub?: string }
		| { kind: 'protein'; accession: string; label: string; sub?: string };

	let { item, onClose }: { item: ViewItem | null; onClose: () => void } = $props();

	let host: HTMLDivElement;
	let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let errMsg = $state('');
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let viewer: any = null;

	async function render(it: ViewItem) {
		status = 'loading';
		errMsg = '';
		try {
			const mol3d = await import('3dmol');
			if (!host) return;
			host.innerHTML = '';
			viewer = mol3d.createViewer(host, { backgroundColor: '#0a1511' });

			if (it.kind === 'compound') {
				const r = await fetch(`/api/structure/${it.cid}`);
				if (!r.ok) throw new Error('No 3D structure available for this compound.');
				const sdf = await r.text();
				viewer.addModel(sdf, 'sdf');
				viewer.setStyle({}, { stick: { radius: 0.14, colorscheme: 'Jmol' }, sphere: { scale: 0.26 } });
			} else {
				const r = await fetch(`/api/protein/${it.accession}`);
				if (!r.ok) throw new Error('No predicted structure available for this target.');
				const pdb = await r.text();
				viewer.addModel(pdb, 'pdb');
				viewer.setStyle({}, { cartoon: { color: 'spectrum' } });
			}
			viewer.zoomTo();
			viewer.render();
			viewer.zoom(1.15, 600);
			status = 'ready';
			spin();
		} catch (e) {
			status = 'error';
			errMsg = e instanceof Error ? e.message : 'Could not load structure.';
		}
	}

	let spinning = $state(true);
	function spin() {
		if (viewer) viewer.spin(spinning ? 'y' : false);
	}
	function toggleSpin() {
		spinning = !spinning;
		spin();
	}

	$effect(() => {
		if (item) render(item);
		else {
			try {
				viewer?.clear?.();
			} catch {
				/* noop */
			}
			viewer = null;
			status = 'idle';
		}
	});

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window on:keydown={onKey} />

{#if item}
	<div
		class="overlay"
		onclick={onClose}
		onkeydown={() => {}}
		role="button"
		tabindex="-1"
		aria-label="Close structure viewer"
	>
		<div class="panel" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1" aria-label="{item.label} structure">
			<header>
				<div>
					<span class="kind mono">{item.kind === 'compound' ? '3D conformer' : 'Predicted fold'}</span>
					<h3 class="display">{item.label}</h3>
					{#if item.sub}<span class="sub mono">{item.sub}</span>{/if}
				</div>
				<div class="controls">
					<button class="ctl" onclick={toggleSpin} title="Toggle rotation">{spinning ? '❚❚' : '⟳'}</button>
					<button class="ctl close" onclick={onClose} aria-label="Close">✕</button>
				</div>
			</header>

			<div class="stage">
				<div class="viewer" bind:this={host}></div>
				{#if status === 'loading'}
					<div class="state"><span class="spinner"></span> loading structure…</div>
				{:else if status === 'error'}
					<div class="state err">{errMsg}</div>
				{/if}
			</div>

			<footer class="mono">
				{item.kind === 'compound'
					? 'Source: PubChem 3D conformer'
					: 'Source: AlphaFold DB predicted model (' + item.accession + ')'}
			</footer>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: rgba(3, 8, 6, 0.74);
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
		width: min(560px, 96vw);
		background: var(--ink-1);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius);
		box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.9);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 1rem 1.2rem;
		border-bottom: 1px solid var(--line);
	}
	.kind {
		font-size: 0.6rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--brass);
	}
	header h3 {
		margin: 0.15rem 0 0;
		font-size: 1.3rem;
		color: var(--bone);
	}
	.sub {
		font-size: 0.68rem;
		color: var(--bone-dim);
	}
	.controls {
		display: flex;
		gap: 0.4rem;
	}
	.ctl {
		background: var(--ink-3);
		border: 1px solid var(--line);
		color: var(--bone-dim);
		border-radius: var(--radius);
		width: 2rem;
		height: 2rem;
		font-size: 0.8rem;
	}
	.ctl:hover {
		color: var(--jade);
		border-color: var(--jade-line);
	}
	.stage {
		position: relative;
		height: 360px;
		background: #0a1511;
	}
	.viewer {
		position: absolute;
		inset: 0;
	}
	.viewer :global(canvas) {
		border-radius: 0;
	}
	.state {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		color: var(--bone-dim);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		pointer-events: none;
	}
	.state.err {
		color: var(--warn);
		padding: 2rem;
		text-align: center;
	}
	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid var(--ink-3);
		border-top-color: var(--jade);
		border-radius: 50%;
		animation: sp 0.8s linear infinite;
	}
	@keyframes sp {
		to {
			transform: rotate(360deg);
		}
	}
	footer {
		padding: 0.7rem 1.2rem;
		border-top: 1px solid var(--line);
		font-size: 0.64rem;
		color: var(--bone-faint);
	}
</style>
