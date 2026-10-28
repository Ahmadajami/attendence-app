<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { formToasts } from '#lib/utils/form-toasts.js';
	import { VALIDITY_OPTIONS, endSide, personName, validityLabel } from './labels.js';
	import { issueCodeSchema, type UsersMessage } from './schema.js';

	type Target = { id: string; fullName: string; fullNameAr: string | null; isSelf: boolean };

	type Props = {
		data: SuperValidated<Infer<typeof issueCodeSchema>, UsersMessage>;
		target: Target | null;
		open: boolean;
		onissued: (message: Extract<UsersMessage, { kind: 'issued' }>) => void;
	};

	let { data, target, open = $bindable(), onissued }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(issueCodeSchema),
			...formToasts(),
			onUpdated: ({ form }) => {
				if (form.message?.kind === 'issued') {
					onissued(form.message);
					open = false;
				}
			}
		}
	);
	const { form: formData, message, enhance, delayed } = form;

	$effect(() => {
		if (target) $formData.userId = target.id;
	});
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()}>
		{#if target}
			<Sheet.Header>
				<Sheet.Title>{m.users_issue_code()}</Sheet.Title>
				<Sheet.Description>
					{target.isSelf
						? m.users_issue_own_code_description()
						: m.users_issue_code_description({ name: personName(target) })}
				</Sheet.Description>
			</Sheet.Header>

			<form method="POST" action="?/issueCode" class="space-y-4 px-4 pb-4" use:enhance>
				<input type="hidden" name="userId" value={$formData.userId} />

				<Form.Field {form} name="validity">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.users_field_validity()}</Form.Label>
							<Select.Root type="single" bind:value={$formData.validity} name={props.name}>
								<Select.Trigger {...props} class="w-full">
									{validityLabel($formData.validity)}
								</Select.Trigger>
								<Select.Content>
									{#each VALIDITY_OPTIONS as option (option)}
										<Select.Item value={option} label={validityLabel(option)} />
									{/each}
								</Select.Content>
							</Select.Root>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				{#if $message?.kind === 'error'}
					<p class="text-sm text-destructive" role="alert">{$message.text}</p>
				{/if}

				<Form.Button class="w-full" disabled={$delayed}>
					{#if $delayed}
						<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
					{/if}
					{m.users_issue_submit()}
				</Form.Button>
			</form>
		{/if}
	</Sheet.Content>
</Sheet.Root>
