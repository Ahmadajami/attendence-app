<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import { m } from '#lib/paraglide/messages.js';

	let { class: className, ...restProps }: SVGAttributes<SVGSVGElement> = $props();
</script>

<!-- The SYRAVIA wordmark. Its colour is the `primary` token (through `currentColor`), so it follows
     the light and dark themes. The text stays Latin and left-to-right in Arabic too. Cinzel is used
     once the font package is installed; until then the browser picks the next serif in the list. -->
<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 240 40"
	fill="none"
	role="img"
	aria-label={m.app_logo_label()}
	class={['h-10 w-auto shrink-0 text-primary', className]}
	{...restProps}
>
	<text
		x="50%"
		y="28"
		text-anchor="middle"
		direction="ltr"
		fill="currentColor"
		font-family="'Cinzel Variable', 'Cinzel', 'Trajan Pro', 'Bodoni MT', 'Didot', 'Playfair Display', serif"
		font-size="24"
		font-weight="500"
		letter-spacing="0.18em">SYRAVIA</text
	>
</svg>
