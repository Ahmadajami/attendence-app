<script lang="ts">
	import { goto } from '$app/navigation';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import StaffCreateForm from '#lib/app/staff/StaffCreateForm.svelte';
	import StaffListsHost from '#lib/app/staff-lists/StaffListsHost.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { StaffMessage } from '#lib/schemas/staff.schema.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** After the save: the new person's profile, on the Personal tab (V6). */
	function openProfile(message: StaffMessage) {
		if (!message.staffId) return;
		const href = `${localizedHref('/employees/[id]', { id: message.staffId })}?tab=personal`;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- localizedHref() resolves; only `?tab=` is added
		void goto(href);
	}
</script>

<svelte:head>
	<title>{m.employee_new_title()} · {m.nav_employees()} · {m.app_name()}</title>
</svelte:head>

<section class="flex max-w-5xl flex-col gap-4">
	<Button href={localizedHref('/employees')} variant="ghost" size="sm" class="self-start">
		<ArrowLeftIcon data-icon="inline-start" class="rtl:rotate-180" />
		{m.roster_back_to_employees()}
	</Button>

	<StaffListsHost data={data.listForm} lists={data.lists}>
		<StaffCreateForm
			data={data.form}
			functions={data.functions}
			departments={data.departments}
			teams={data.teams}
			jobTitles={data.lists.jobTitles}
			onSaved={openProfile}
		/>
	</StaffListsHost>
</section>
