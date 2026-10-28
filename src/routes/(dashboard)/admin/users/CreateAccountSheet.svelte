<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { ID_DIGITS } from '#lib/schemas/auth.schema.js';
	import { formToasts } from '#lib/utils/form-toasts.js';
	import { VALIDITY_OPTIONS, endSide, roleName, validityLabel, type RoleLabel } from './labels.js';
	import { createAccountSchema, type UsersMessage } from './schema.js';

	type Props = {
		data: SuperValidated<Infer<typeof createAccountSchema>, UsersMessage>;
		roles: RoleLabel[];
		open: boolean;
		onissued: (message: Extract<UsersMessage, { kind: 'issued' }>) => void;
	};

	let { data, roles, open = $bindable(), onissued }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(createAccountSchema),
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

	const selectedRole = $derived(roles.find((r) => r.key === $formData.role));

	function digitsOnly(event: InputEvent) {
		const text = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
		if (text && !ID_DIGITS.test(text)) event.preventDefault();
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="overflow-y-auto">
		<Sheet.Header>
			<Sheet.Title>{m.users_new()}</Sheet.Title>
			<Sheet.Description>{m.users_create_description()}</Sheet.Description>
		</Sheet.Header>

		<form method="POST" action="?/create" class="space-y-4 px-4 pb-4" use:enhance>
			<Form.Field {form} name="loginId">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.login_id_label()}</Form.Label>
						<Input
							{...props}
							bind:value={$formData.loginId}
							inputmode="numeric"
							autocomplete="off"
							dir="ltr"
							onbeforeinput={digitsOnly}
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="fullName">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.users_field_full_name()}</Form.Label>
						<Input {...props} bind:value={$formData.fullName} dir="ltr" autocomplete="off" />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="fullNameAr">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.users_field_full_name_ar()}</Form.Label>
						<Input {...props} bind:value={$formData.fullNameAr} dir="rtl" autocomplete="off" />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="role">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.users_field_role()}</Form.Label>
						<Select.Root type="single" bind:value={$formData.role} name={props.name}>
							<Select.Trigger {...props} class="w-full">
								{selectedRole ? roleName(selectedRole) : ''}
							</Select.Trigger>
							<Select.Content>
								{#each roles as role (role.key)}
									<Select.Item value={role.key} label={roleName(role)} />
								{/each}
							</Select.Content>
						</Select.Root>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

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
				{m.users_create_submit()}
			</Form.Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
