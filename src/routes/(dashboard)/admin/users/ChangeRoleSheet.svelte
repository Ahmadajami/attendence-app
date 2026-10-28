<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { formToasts } from '#lib/utils/form-toasts.js';
	import { personName, roleName, type RoleLabel } from './labels.ts';
	import { changeRoleSchema, type UsersMessage } from './schema.js';

	type Target = { id: string; fullName: string; fullNameAr: string | null; role: RoleLabel };

	type Props = {
		data: SuperValidated<Infer<typeof changeRoleSchema>, UsersMessage>;
		roles: RoleLabel[];
		target: Target | null;
		open: boolean;
	};

	let { data, roles, target, open = $bindable() }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(changeRoleSchema),
			...formToasts(),
			onUpdated: ({ form }) => {
				if (form.message?.kind === 'success') {
					toast.success(form.message.text);
					open = false;
				}
			}
		}
	);
	const { form: formData, message, enhance, delayed } = form;
	const selectedRole = $derived(roles.find((r) => r.key === $formData.role));

	$effect(() => {
		if (target) {
			$formData.userId = target.id;
			$formData.role = target.role.key;
		}
	});
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="bottom">
		{#if target}
			<Sheet.Header>
				<Sheet.Title>{m.users_change_role()}</Sheet.Title>
				<Sheet.Description>
					{m.users_change_role_description({ name: personName(target) })}
				</Sheet.Description>
			</Sheet.Header>

			<form method="POST" action="?/changeRole" class="space-y-4 px-4 pb-4" use:enhance>
				<input type="hidden" name="userId" value={$formData.userId} />

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

				{#if $message?.kind === 'error'}
					<p class="text-sm text-destructive" role="alert">{$message.text}</p>
				{/if}

				<Form.Button class="w-full" disabled={$delayed}>
					{#if $delayed}
						<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
					{/if}
					{m.users_role_submit()}
				</Form.Button>
			</form>
		{/if}
	</Sheet.Content>
</Sheet.Root>
