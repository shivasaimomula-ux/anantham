<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	let { children } = $props();

	const nav = [
		{ href: '/', label: 'Overview' },
		{ href: '/explore', label: 'Explore' },
		{ href: '/discover', label: 'Discover' },
		{ href: '/formulate', label: 'Formulate' },
		{ href: '/formula', label: 'Formula' },
		{ href: '/how-it-works', label: 'How It Works' }
	];
	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<svelte:head>
	<title>HERBENZO — Nature-Inspired Drug Discovery</title>
	<meta
		name="description"
		content="HERBENZO traces medicinal plants from traditional knowledge through bioactive compounds to protein targets and formulations — on live open scientific data."
	/>
	<link rel="icon" type="image/png" href="/herbenzo-mark.png" />
</svelte:head>

<div class="shell">
	<header class="nav">
		<div class="wrap navrow">
			<a href="/" class="brand" aria-label="HERBENZO home">
				<img class="mark" src="/herbenzo-mark.png" alt="" width="36" height="36" />
				<span class="b2 display">HERBENZO</span>
			</a>

			<nav class="links" aria-label="Primary">
				{#each nav as n}
					<a href={n.href} class="link" class:active={isActive(n.href)}>{n.label}</a>
				{/each}
			</nav>

			<div class="navright">
				<span class="pill"><span class="dot"></span> Live data</span>
				<a href="/explore" class="btn btn-ghost desk">Launch tool</a>
			</div>
		</div>
	</header>

	<main>
		{@render children()}
	</main>

	<footer class="foot">
		<div class="wrap">
			<div class="footgrid">
				<div>
					<div class="brand">
						<img class="mark" src="/herbenzo-mark.png" alt="" width="32" height="32" />
						<span class="b2 display">HERBENZO</span>
					</div>
					<p class="muted footblurb">
						Nature-inspired drug discovery — tracing medicinal plants from traditional knowledge to
						bioactive compounds, protein targets and formulations, on open scientific data.
					</p>
				</div>
				<div class="footcol">
					<h4>Platform</h4>
					<a href="/explore">Explore</a>
					<a href="/how-it-works">How it works</a>
				</div>
				<div class="footcol">
					<h4>Data sources</h4>
					<span>PubChem · ChEMBL</span>
					<span>UniProt · Open Targets</span>
					<span>LOTUS · AlphaFold · PubMed</span>
				</div>
			</div>
			<div class="footbase">
				<span class="muted">© 2026 HERBENZO — Nature-Inspired Drug Discovery.</span>
				<span class="muted mono">v0.1</span>
			</div>
		</div>
	</footer>
</div>

<style>
	.shell {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	main {
		flex: 1;
	}

	.nav {
		position: sticky;
		top: 0;
		z-index: 50;
		backdrop-filter: blur(12px) saturate(1.3);
		background: color-mix(in oklab, var(--ink) 86%, transparent);
		border-bottom: 1px solid var(--line);
	}
	.navrow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 4.2rem;
		gap: 1rem;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
	}
	.b2 {
		color: var(--bone);
		font-size: 1.32rem;
		font-weight: 700;
		letter-spacing: 0.08em;
	}
	.mark {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		object-fit: contain;
	}
	.foot .mark {
		width: 32px;
		height: 32px;
	}

	.links {
		display: flex;
		gap: 2rem;
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
	}
	.link {
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--bone-dim);
		padding: 0.3rem 0;
		border-bottom: 1px solid transparent;
		transition: color 0.18s;
	}
	.link:hover {
		color: var(--bone);
	}
	.link.active {
		color: var(--jade);
		border-bottom-color: var(--jade);
	}

	.navright {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.foot {
		border-top: 1px solid var(--line);
		margin-top: 5rem;
		padding-block: 3rem 2rem;
		background: var(--ink-1);
	}
	.footgrid {
		display: grid;
		grid-template-columns: 1.6fr 1fr 1fr;
		gap: 2rem;
	}
	.footblurb {
		max-width: 26rem;
		font-size: 0.86rem;
		margin-top: 0.8rem;
	}
	.footcol {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.footcol h4 {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--brass);
		margin: 0 0 0.3rem;
		font-weight: 500;
	}
	.footcol a,
	.footcol span {
		font-size: 0.82rem;
		color: var(--bone-dim);
	}
	.footcol a:hover {
		color: var(--jade);
	}
	.footbase {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 2.4rem;
		padding-top: 1.4rem;
		border-top: 1px solid var(--line);
		font-size: 0.72rem;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	@media (max-width: 820px) {
		.links {
			display: none;
		}
		.desk {
			display: none;
		}
		.footgrid {
			grid-template-columns: 1fr;
			gap: 1.6rem;
		}
	}
</style>
