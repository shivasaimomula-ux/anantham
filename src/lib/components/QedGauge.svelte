<script lang="ts">
	// Semicircle QED gauge. Color by drug-likeness band.
	let { value = 0, size = 128 }: { value: number; size?: number } = $props();

	const R = 54;
	const CX = 60;
	const CY = 60;
	// semicircle from 180deg -> 0deg
	function pt(frac: number) {
		const a = Math.PI * (1 - frac);
		return [CX + R * Math.cos(a), CY - R * Math.sin(a)];
	}
	const arc = (frac: number) => {
		const [x0, y0] = pt(0);
		const [x1, y1] = pt(Math.max(0.0001, Math.min(1, frac)));
		const large = frac > 0.5 ? 1 : 0;
		return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
	};
	const color = $derived(value >= 0.5 ? 'var(--good)' : value >= 0.35 ? 'var(--warn)' : 'var(--crit)');
	const label = $derived(value >= 0.5 ? 'drug-like' : value >= 0.35 ? 'lead-like' : 'fragment-like');
</script>

<div class="gauge" style="width:{size}px">
	<svg viewBox="0 0 120 74" width={size} aria-label="QED {value.toFixed(2)}">
		<path d={arc(1)} fill="none" stroke="var(--ink-3)" stroke-width="9" stroke-linecap="round" />
		<path
			d={arc(value)}
			fill="none"
			stroke={color}
			stroke-width="9"
			stroke-linecap="round"
			style="transition: stroke-dashoffset .6s"
		/>
		<text x="60" y="52" text-anchor="middle" class="val tnum" fill="var(--bone)">{value.toFixed(2)}</text>
	</svg>
	<div class="cap mono" style="color:{color}">{label}</div>
</div>

<style>
	.gauge {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.val {
		font-family: var(--font-mono);
		font-size: 20px;
		font-weight: 500;
	}
	.cap {
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		margin-top: -0.3rem;
	}
</style>
