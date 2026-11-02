<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';

	type Props = {
		/** Classes for the flower itself (its size, e.g. `size-64`). */
		class?: SVGAttributes<SVGSVGElement>['class'];
	};

	let { class: className = 'size-40' }: Props = $props();

	/** One petal every 72°: five petals around the centre. */
	const PETAL_ANGLES = [0, 72, 144, 216, 288];
</script>

<!-- A faint flower in the bottom corner on the inline-end side (right in English, left in Arabic).
     The parent must be `relative isolate`: `isolate` keeps the `-z-10` layer above the parent's own
     background and below its content. The layer clips the flower, not the parent, so sticky bars,
     wide tables and focus rings in the parent are unaffected.
     It blooms once when the page loads, then turns slowly forever (plain CSS, no JS).
     Reduced-motion users see it already open and still. -->
<div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
	<svg
		viewBox="0 0 200 200"
		fill="none"
		stroke="currentColor"
		stroke-linecap="round"
		stroke-linejoin="round"
		class={['flower absolute -inset-e-8 -bottom-8 text-primary opacity-10 dark:opacity-5', className]}
	>
		{#each PETAL_ANGLES as angle, i (angle)}
			<!-- The attribute places the petal; the inner group animates, so the CSS transform does not
			     replace the rotation. -->
			<g transform="rotate({angle} 100 100)">
				<g class="petal" style:--i={i}>
					<!-- Broad pen stroke on one side of the petal, hairline on the other. -->
					<path
						d="M100 92 C72 70 70 36 100 14 C86 36 86 70 100 92 Z"
						fill="currentColor"
						stroke="none"
					/>
					<path d="M100 14 C126 36 126 70 100 92" stroke-width="1.5" />
					<path d="M100 80 C96 62 96 44 100 30" stroke-width="1" />
				</g>
			</g>
		{/each}
		<g class="centre">
			<circle cx="100" cy="100" r="8" stroke-width="2.5" />
			<circle cx="100" cy="100" r="2.5" fill="currentColor" stroke="none" />
		</g>
	</svg>
</div>

<style>
	/* Transform and opacity only (cheap to animate).
	   Two animations on the flower: the bloom turn, then an endless spin that starts as the bloom
	   ends (1.6s delay). Both animate `rotate`; the later one wins while it runs, and since the bloom
	   ends at 0deg and the spin starts at 0deg, the hand-off is seamless. */
	.flower {
		transform-origin: 50% 50%;
		animation:
			flower-turn 1.6s cubic-bezier(0.22, 1, 0.36, 1) both,
			flower-spin 40s linear 1.6s infinite;
	}

	/* Each petal grows out of the centre (the bottom middle of its own box), one after another. */
	.petal {
		transform-box: fill-box;
		transform-origin: 50% 100%;
		animation: petal-open 0.9s cubic-bezier(0.22, 1, 0.36, 1) calc(var(--i) * 120ms) both;
	}

	.centre {
		animation: centre-in 0.6s ease-out 0.7s both;
	}

	@keyframes flower-turn {
		from {
			rotate: -36deg;
			scale: 0.9;
		}
	}

	@keyframes flower-spin {
		from {
			rotate: 0deg;
		}
		to {
			rotate: 360deg;
		}
	}

	@keyframes petal-open {
		from {
			scale: 0;
			opacity: 0;
		}
	}

	@keyframes centre-in {
		from {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.flower,
		.petal,
		.centre {
			animation: none;
		}
	}
</style>
