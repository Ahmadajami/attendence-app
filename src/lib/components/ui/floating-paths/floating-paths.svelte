<script lang="ts">
	import { cn } from '#lib/utils.js';
	import { motion } from 'motion-sv';
	import type { HTMLAttributes } from 'svelte/elements';

	type FloatingPath = {
		id: number;
		d: string;
		opacity: number;
		width: number;
		duration: number;
	};

	type FloatingPathsProps = HTMLAttributes<HTMLDivElement> & {
		class?: string;
		position: number;
	};

	let { class: className = '', position, ...restProps }: FloatingPathsProps = $props();

	// Every other step of the original 36-path spread: same footprint, half the per-frame repaints.
	const paths = $derived.by<FloatingPath[]>(() =>
		Array.from({ length: 18 }, (_, index) => {
			const i = index * 2;
			return {
				id: index,
				d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
				opacity: 0.1 + i * 0.03,
				width: 0.5 + i * 0.03,
				// Distinct per path so the strokes drift out of phase.
				duration: 20 + index * 0.5
			};
		})
	);

	// Keyframes start and end on the same values (and `initial` matches them), so neither the
	// first frame nor each repeat jumps. The stroke spans pathOffset → pathOffset + pathLength;
	// keeping that ≤ 1 means a path never slides fully off and vanishes.
	const initial = { pathLength: 0.3, pathOffset: 0, opacity: 0.3 };
	const animate = {
		pathLength: [0.3, 0.8, 0.3],
		pathOffset: [0, 0.2, 0],
		opacity: [0.3, 0.6, 0.3]
	};
</script>

<!-- Own layer + strict containment so per-frame stroke repaints stay inside this box. -->
<div
	aria-hidden="true"
	class={cn(
		'pointer-events-none absolute inset-0 isolate transform-gpu will-change-transform contain-strict ',
		className
	)}
	{...restProps}
>
	<svg class="h-full w-full text-primary contain-strict" fill="none" viewBox="0 0 696 316">
		<title>Background Paths</title>

		{#each paths as path (path.id)}
			<motion.path
				{animate}
				d={path.d}
				{initial}
				stroke="currentColor"
				stroke-opacity={path.opacity}
				stroke-width={path.width}
				transition={{
					duration: path.duration,
					repeat: Number.POSITIVE_INFINITY,
					ease: 'easeInOut'
				}}
			/>
		{/each}
	</svg>
</div>
