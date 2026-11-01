<script lang="ts">
	import { goto } from '$app/navigation';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import UserIcon from 'phosphor-svelte/lib/UserIcon';
	import StaffForm from '#lib/app/staff/StaffForm.svelte';
	import StaffListsHost from '#lib/app/staff-lists/StaffListsHost.svelte';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { StaffMessage } from '#lib/schemas/staff.schema.js';
	import { initials } from '#lib/workforce/profile.js';
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

<section class="flex max-w-3xl flex-col gap-4">
	<Button href={localizedHref('/employees')} variant="ghost" size="sm" class="self-start">
		<ArrowLeftIcon data-icon="inline-start" class="rtl:rotate-180" />
		{m.roster_back_to_employees()}
	</Button>

	<StaffListsHost data={data.listForm} lists={data.lists}>
		<StaffForm
			data={data.form}
			mode="create"
			action="?/save"
			functions={data.functions}
			departments={data.departments}
			teams={data.teams}
			jobTitles={data.lists.jobTitles}
			onSaved={openProfile}
		>
			{#snippet header(name)}
				<Card.Root>
					<Card.Content class="flex items-center gap-4">
						<Avatar.Root class="size-16">
							<Avatar.Fallback class="text-lg font-medium">
								{#if name}
									{initials(name)}
								{:else}
									<UserIcon class="size-6" />
								{/if}
							</Avatar.Fallback>
						</Avatar.Root>
						<div class="flex min-w-0 flex-col gap-1">
							<h2 class="text-2xl font-semibold tracking-tight">{m.employee_new_title()}</h2>
							<p class="truncate text-muted-foreground">
								{name || m.employee_new_description()}
							</p>
						</div>
					</Card.Content>
				</Card.Root>
			{/snippet}
		</StaffForm>
	</StaffListsHost>
</section>
