<script lang="ts">
	import { onMount } from 'svelte';
	import type { EnrichedCompound, TargetOut, Edge } from '#lib/types';

	let {
		compounds,
		targets,
		edges,
		onSelectTarget
	}: {
		compounds: EnrichedCompound[];
		targets: TargetOut[];
		edges: Edge[];
		onSelectTarget: (t: TargetOut) => void;
	} = $props();

	let host: HTMLDivElement;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let cy: any = null;

	async function build() {
		if (!host) return;
		const cytoscape = (await import('cytoscape')).default;
		if (cy) {
			cy.destroy();
			cy = null;
		}
		const H = 460;
		const cCol = 90;
		const tCol = 640;
		const spread = (i: number, n: number) => (n <= 1 ? H / 2 : 40 + (i * (H - 80)) / (n - 1));

		const nodes = [
			...compounds.map((c, i) => ({
				data: { id: 'C:' + c.name, label: c.name, kind: 'compound' },
				position: { x: cCol, y: spread(i, compounds.length) }
			})),
			...targets.map((t, i) => ({
				data: { id: 'T:' + t.accession, label: t.gene ?? t.prefName, kind: 'target', acc: t.accession },
				position: { x: tCol, y: spread(i, targets.length) }
			}))
		];
		const els = [
			...nodes,
			...edges
				.filter((e) => compounds.some((c) => c.name === e.compound))
				.map((e) => ({
					data: {
						id: `${e.compound}->${e.target}`,
						source: 'C:' + e.compound,
						target: 'T:' + e.target,
						w: 0.6 + e.score * 5,
						mech: e.evidence === 'mechanism' ? 1 : 0
					}
				}))
		];

		cy = cytoscape({
			container: host,
			elements: els,
			minZoom: 0.3,
			maxZoom: 2.5,
			wheelSensitivity: 0.2,
			style: [
				{
					selector: 'node',
					style: {
						label: 'data(label)',
						'font-family': 'IBM Plex Mono, monospace',
						'font-size': '10px',
						color: '#ece6d6',
						'text-valign': 'center',
						'text-halign': 'center',
						'text-margin-y': 0,
						'text-wrap': 'wrap',
						'text-max-width': '80px',
						width: 18,
						height: 18,
						'border-width': 2
					}
				},
				{
					selector: 'node[kind="compound"]',
					style: {
						'background-color': '#e7f6ec',
						'border-color': '#1f9150',
						shape: 'ellipse',
						width: 20,
						height: 20,
						'text-margin-y': -12,
						color: '#0f4a2a'
					}
				},
				{
					selector: 'node[kind="target"]',
					style: {
						'background-color': '#fbf1d9',
						'border-color': '#b2851f',
						shape: 'round-rectangle',
						width: 'label',
						height: 22,
						padding: '6px',
						'text-margin-y': 0,
						color: '#6a4e13'
					}
				},
				{
					selector: 'edge',
					style: {
						width: 'data(w)',
						'line-color': '#b2851f',
						opacity: 0.35,
						'curve-style': 'bezier',
						'control-point-step-size': 40
					}
				},
				{ selector: 'edge[mech=1]', style: { 'line-color': '#1f9150', 'line-style': 'solid' } },
				{ selector: 'edge[mech=0]', style: { 'line-style': 'dashed', 'line-dash-pattern': [6, 3] } },
				{
					selector: '.hl',
					style: { opacity: 1, 'line-color': '#1f9150', width: 'data(w)', 'z-index': 99 }
				},
				{ selector: '.dim', style: { opacity: 0.12 } },
				{ selector: 'node.focus', style: { 'border-color': '#1f9150', 'border-width': 3 } }
			],
			layout: { name: 'preset', fit: true, padding: 30 }
		});

		cy.on('mouseover', 'node', (e: any) => {
			const n = e.target;
			const nb = n.closedNeighborhood();
			cy.elements().addClass('dim');
			nb.removeClass('dim');
			nb.connectedEdges().addClass('hl');
		});
		cy.on('mouseout', 'node', () => {
			cy.elements().removeClass('dim hl');
		});
		cy.on('tap', 'node[kind="target"]', (e: any) => {
			const acc = e.target.data('acc');
			const t = targets.find((x) => x.accession === acc);
			if (t) onSelectTarget(t);
		});
	}

	onMount(() => {
		build();
		return () => cy?.destroy();
	});

	// rebuild when data changes
	$effect(() => {
		// reference reactive inputs
		void (compounds, targets, edges);
		if (host) build();
	});
</script>

<div class="netwrap">
	<div class="graph" bind:this={host}></div>
	<div class="legend">
		<span><i class="n comp"></i> compound</span>
		<span><i class="n targ"></i> protein target</span>
		<span><i class="e mech"></i> mechanism</span>
		<span><i class="e bio"></i> bioactivity</span>
		<span class="hint mono">drag · scroll to zoom · click a target →</span>
	</div>
</div>

<style>
	.netwrap {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background:
			radial-gradient(40rem 20rem at 30% 0%, rgba(48, 216, 154, 0.05), transparent 70%),
			var(--ink-1);
		overflow: hidden;
	}
	.graph {
		width: 100%;
		height: 460px;
		touch-action: none;
	}
	.legend {
		display: flex;
		align-items: center;
		gap: 1.1rem;
		flex-wrap: wrap;
		padding: 0.7rem 1rem;
		border-top: 1px solid var(--line);
		font-size: 0.68rem;
		color: var(--bone-dim);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.n {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 2px solid;
	}
	.n.comp {
		border-color: var(--jade);
		background: #e7f6ec;
	}
	.n.targ {
		border-color: var(--brass);
		background: #fbf1d9;
		border-radius: 2px;
	}
	.e {
		width: 16px;
		height: 0;
		border-top: 2px solid;
	}
	.e.mech {
		border-color: var(--jade);
	}
	.e.bio {
		border-top-style: dashed;
		border-color: var(--brass);
	}
	.hint {
		margin-left: auto;
		color: var(--bone-faint);
		font-size: 0.62rem;
	}
	@media (max-width: 640px) {
		.hint {
			display: none;
		}
	}
</style>
