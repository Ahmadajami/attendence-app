<script lang="ts">
	import { tick } from 'svelte';
	import * as Select from '#lib/components/ui/select/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { EMPLOYEE_STATUSES, type EmployeeStatus } from './labels.js';

	type Props = {
		status: EmployeeStatus;
		counts: Record<EmployeeStatus, number>;
		/** The open tab, kept in the URL beside `?status=`. */
		view: string;
	};

	let { status, counts, view }: Props = $props();

	let form: HTMLFormElement | null = $state(null);

	function label(value: EmployeeStatus): string {
		const count = counts[value];
		if (value === 'inactive') return m.employees_status_inactive({ count });
		if (value === 'all') return m.employees_status_all({ count });
		return m.employees_status_active({ count });
	}
</script>

<!-- A GET filter (management tree plan M22): the status lives in `?status=`, so it survives a
     reload; the load doesn't read it, so changing it doesn't refetch. -->
<form
	method="GET"
	bind:this={form}
	data-sveltekit-noscroll
	data-sveltekit-reset="false"
	data-sveltekit-replacestate
>
	<input type="hidden" name="view" value={view} />
	<Select.Root
		type="single"
		name="status"
		value={status}
		onValueChange={async () => {
			// Let the hidden input take the new value first.
			await tick();
			form?.requestSubmit();
		}}
	>
		<Select.Trigger class="w-44" aria-label={m.employees_status_label()}>
			{label(status)}
		</Select.Trigger>
		<Select.Content>
			{#each EMPLOYEE_STATUSES as value (value)}
				<Select.Item {value} label={label(value)} />
			{/each}
		</Select.Content>
	</Select.Root>
</form>
