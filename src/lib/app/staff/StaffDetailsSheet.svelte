<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { staffFormSchema, StaffMessage } from '#lib/schemas/staff.schema.js';
	import type { StaffListOption } from '#lib/types/profile.js';
	import type { DepartmentOption, StaffFunctionOption, TeamOption } from '#lib/types/workforce.js';
	import { endSide } from '#lib/utils/locale.js';
	import StaffForm from './StaffForm.svelte';

	type Props = {
		/** The page's prefilled `staff-edit` form. */
		data: SuperValidated<Infer<typeof staffFormSchema>, StaffMessage>;
		/** The person's name, for the description. */
		name: string;
		functions: StaffFunctionOption[];
		departments: DepartmentOption[];
		teams: TeamOption[];
		jobTitles: StaffListOption[];
		open: boolean;
	};

	let {
		data,
		name,
		functions,
		departments,
		teams,
		jobTitles,
		open = $bindable()
	}: Props = $props();
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="overflow-y-auto sm:max-w-lg">
		<Sheet.Header>
			<Sheet.Title>{m.staff_edit()}</Sheet.Title>
			<Sheet.Description>{m.staff_edit_description({ name })}</Sheet.Description>
		</Sheet.Header>
		<!-- The content mounts on open, so the form starts from the latest saved values each time. -->
		<div class="px-4 pb-4">
			<StaffForm
				{data}
				mode="edit"
				action="?/saveStaff"
				{functions}
				{departments}
				{teams}
				{jobTitles}
				onSaved={() => (open = false)}
			/>
		</div>
	</Sheet.Content>
</Sheet.Root>
