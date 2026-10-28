<script lang="ts">
	import { flushSync } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { mode, toggleMode } from 'mode-watcher';
	import MoonIcon from 'phosphor-svelte/lib/MoonIcon';
	import SunIcon from 'phosphor-svelte/lib/SunIcon';
	import { cn } from '#lib/utils.js';

	interface AnimatedThemeTogglerProps extends Omit<HTMLButtonAttributes, 'onclick'> {
		duration?: number;
		label?: string;
	}

	let {
		class: className,
		duration = 400,
		label = 'Toggle theme',
		...props
	}: AnimatedThemeTogglerProps = $props();

	const isDark = $derived(mode.current === 'dark');

	async function toggleTheme(event: MouseEvent & { currentTarget: HTMLButtonElement }) {
		const button = event.currentTarget;
		const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (!document.startViewTransition || reduceMotion) {
			toggleMode();
			return;
		}

		// mode-watcher applies the `dark` class in an effect; flush it inside the transition.
		await document.startViewTransition(() => {
			toggleMode();
			flushSync();
		}).ready;

		const { top, left, width, height } = button.getBoundingClientRect();
		const x = left + width / 2;
		const y = top + height / 2;
		const maxRadius = Math.hypot(
			Math.max(left, window.innerWidth - left),
			Math.max(top, window.innerHeight - top)
		);

		document.documentElement.animate(
			{
				clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxRadius}px at ${x}px ${y}px)`]
			},
			{
				duration,
				easing: 'ease-in-out',
				pseudoElement: '::view-transition-new(root)'
			}
		);
	}
</script>

<button
	type="button"
	onclick={toggleTheme}
	aria-label={label}
	title={label}
	class={cn(className)}
	{...props}
>
	{#if isDark}
		<SunIcon />
	{:else}
		<MoonIcon />
	{/if}
</button>
