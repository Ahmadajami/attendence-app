<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { endSide } from '#lib/utils/locale.js';
	import { teamFormSchema, type TeamMessage } from '#lib/schemas/teams.schema.js';

	type Target = { id: string; nameEn: string; nameAr: string };

	type Props = {
		data: SuperValidated<Infer<typeof teamFormSchema>, TeamMessage>;
		target: Target | null;
		open: boolean;
	};

	let { data, target, open = $bindable() }: Props = $props();

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(teamFormSchema),
			onUpdated: ({ form }) => {
				if (form.message?.kind === 'success') {
					toast.success(form.message.text);
					open = false;
				} else if (form.message?.kind === 'error') {
					toast.error(form.message.text);
				}
			},
			onError: ({ result }) => toast.error(result.error.message)
		}
	);
	const { form: formData, enhance, delayed } = form;

	$effect(() => {
		$formData.teamId = target?.id ?? '';
		$formData.nameEn = target?.nameEn ?? '';
		$formData.nameAr = target?.nameAr ?? '';
	});
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()}>
		<Sheet.Header>
			<Sheet.Title>{target ? m.teams_rename() : m.teams_new()}</Sheet.Title>
			<Sheet.Description>
				{target ? m.teams_rename_description() : m.teams_create_description()}
			</Sheet.Description>
		</Sheet.Header>

		<form method="POST" action="?/save" class="space-y-4 px-4 pb-4" use:enhance>
			<input type="hidden" name="teamId" value={$formData.teamId} />

			<Form.Field {form} name="nameEn">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.teams_field_name_en()}</Form.Label>
						<Input {...props} bind:value={$formData.nameEn} dir="ltr" autocomplete="off" />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="nameAr">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.teams_field_name_ar()}</Form.Label>
						<Input {...props} bind:value={$formData.nameAr} dir="rtl" autocomplete="off" />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Button class="w-full" disabled={$delayed}>
				{#if $delayed}
					<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
				{/if}
				{target ? m.teams_save() : m.teams_create_submit()}
			</Form.Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
