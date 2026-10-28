<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, locales, setLocale } from '#lib/paraglide/runtime.js';

	const localeLabels: Record<(typeof locales)[number], string> = { en: 'EN', ar: 'ع' };

	const currentLocale = getLocale();
</script>

<div role="group" aria-label={m.language_switch()} class="flex border">
	{#each locales as locale (locale)}
		<button
			type="button"
			lang={locale}
			aria-pressed={locale === currentLocale}
			onclick={() => setLocale(locale)}
			class="h-7 min-w-8 px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground"
		>
			{localeLabels[locale]}
		</button>
	{/each}
</div>
