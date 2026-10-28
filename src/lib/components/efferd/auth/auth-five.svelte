<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { ResolvedPathname } from '$app/types';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
	import EyeIcon from 'phosphor-svelte/lib/EyeIcon';
	import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlashIcon';
	import IdentificationCardIcon from 'phosphor-svelte/lib/IdentificationCardIcon';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import * as InputOTP from '#lib/components/ui/input-otp/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		CODE_LENGTH,
		ID_DIGITS,
		loginSchema,
		type LoginSchema
	} from '#lib/schemas/auth.schema.js';
	import Logo from '#lib/svgs/logo.svelte';
	import { cn } from '#lib/utils.js';
	import { formToasts } from '#lib/utils/form-toasts.js';
	import { untrack } from 'svelte';

	type AuthFiveProps = HTMLAttributes<HTMLElement> & {
		data: SuperValidated<Infer<LoginSchema>, string>;
		homeHref?: ResolvedPathname;
		logoHref?: ResolvedPathname;
		quoteText?: string;
		quoteAuthor?: string;
	};

	let {
		data,
		class: className = '',
		homeHref = localizedHref('/'),
		logoHref = localizedHref('/'),
		quoteText = m.login_quote(),
		quoteAuthor = m.login_quote_author(),
		...restProps
	}: AuthFiveProps = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(loginSchema),
			...formToasts()
		}
	);
	const { form: formData, enhance, delayed } = form;

	let showPassword = $state(false);

	/** Block anything but digits (Western or Arabic-Indic) from being typed or pasted. */
	function digitsOnly(event: InputEvent) {
		const text = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
		if (text && !ID_DIGITS.test(text)) event.preventDefault();
	}
</script>

<main
	class={cn('relative md:h-screen md:overflow-hidden lg:grid lg:grid-cols-2', className)}
	{...restProps}
>
	<div
		class="relative hidden h-full flex-col border-e bg-secondary p-10 lg:flex dark:bg-secondary/20"
	>
		<div
			class="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-background"
		></div>
		<a aria-label={m.back_home()} class="relative z-10 me-auto" href={logoHref}>
			<Logo class="h-4.5 w-auto" />
		</a>
		<div class="z-10 mt-auto">
			<blockquote class="space-y-2">
				<p class="text-xl">{quoteText}</p>
				<footer class="font-mono text-sm font-semibold">~ {quoteAuthor}</footer>
			</blockquote>
		</div>
	</div>

	<div class="relative flex min-h-screen flex-col justify-center px-8">
		<div aria-hidden="true" class="absolute inset-0 isolate -z-10 opacity-60 contain-strict">
			<div
				class="absolute inset-e-0 top-0 h-320 w-140 -translate-y-87.5 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,--theme(--color-foreground/.06)_0,hsla(0,0%,55%,.02)_50%,--theme(--color-foreground/.01)_80%)]"
			></div>
			<div
				class="absolute inset-e-0 top-0 h-320 w-60 [translate:5%_-50%] rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,--theme(--color-foreground/.04)_0,--theme(--color-foreground/.01)_80%,transparent_100%)]"
			></div>
			<div
				class="absolute inset-e-0 top-0 h-320 w-60 -translate-y-87.5 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,--theme(--color-foreground/.04)_0,--theme(--color-foreground/.01)_80%,transparent_100%)]"
			></div>
		</div>

		<Button class="absolute inset-s-5 top-7" href={homeHref} variant="ghost">
			<CaretLeftIcon data-icon="inline-start" class="rtl:-scale-x-100" />
			{m.back_home()}
		</Button>

		<div class="mx-auto w-full max-w-sm space-y-4">
			<div class="flex flex-col space-y-1">
				<h1 class="text-2xl font-bold tracking-wide">{m.login_title()}</h1>
				<p class="text-base text-muted-foreground">{m.login_description()}</p>
			</div>

			<form method="POST" class="space-y-4" use:enhance>
				<Form.Field {form} name="idNumber">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.login_id_label()}</Form.Label>
							<InputGroup.Root>
								<InputGroup.Input
									{...props}
									bind:value={$formData.idNumber}
									type="text"
									inputmode="numeric"
									autocomplete="username"
									dir="ltr"
									placeholder={m.login_id_placeholder()}
									onbeforeinput={digitsOnly}
								/>
								<InputGroup.Addon align="inline-start">
									<IdentificationCardIcon />
								</InputGroup.Addon>
							</InputGroup.Root>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="password">
					<Form.Control>
						<!-- PinInput puts `id` on its wrapper and the rest on the hidden <input>,
						so the label's `for` has to go through `inputId`. -->
						{#snippet children({ props: { id, ...inputProps } })}
							<Form.Label>{m.login_code_label()}</Form.Label>
							<div class="flex items-center gap-2">
								<!-- PIN digits read left to right in both locales. -->
								<div dir="ltr" class="flex-1">
									<InputOTP.Root
										{...inputProps}
										inputId={id}
										bind:value={$formData.password}
										maxlength={CODE_LENGTH}
										pattern={ID_DIGITS.source}
										autocomplete="current-password"
										class="w-full"
									>
										{#snippet children({ cells })}
											<InputOTP.Group class="w-full">
												{#each cells as cell, i (i)}
													<InputOTP.Slot {cell} masked={!showPassword} class="h-9 flex-1 text-sm" />
												{/each}
											</InputOTP.Group>
										{/snippet}
									</InputOTP.Root>
								</div>
								<Button
									variant="outline"
									size="icon"
									aria-label={showPassword ? m.login_password_hide() : m.login_password_show()}
									aria-pressed={showPassword}
									onclick={() => (showPassword = !showPassword)}
								>
									{#if showPassword}
										<EyeSlashIcon />
									{:else}
										<EyeIcon />
									{/if}
								</Button>
							</div>
						{/snippet}
					</Form.Control>
					<Form.Description>{m.login_code_hint()}</Form.Description>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Button class="w-full" disabled={$delayed}>
					{#if $delayed}
						<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
					{/if}
					{m.login_submit()}
				</Form.Button>
			</form>
		</div>
	</div>
</main>
