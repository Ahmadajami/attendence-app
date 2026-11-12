<script lang="ts">
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import type { attendanceRuleFormSchema } from '#lib/schemas/attendance-rules.schema.js';
	import type { StatusMessage } from '#lib/utils/form-toasts.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { AttendanceRuleRowView } from '#lib/server/services/attendance-rules/attendance-rules.bl.js';
	import type { ResolvedAttendanceRules } from '#lib/roster/attendance-rules.js';
	import AttendanceRuleFormSheet from './AttendanceRuleFormSheet.svelte';
	import { prayerLabel, roundingLabel } from './attendance-rule-labels.js';

	// The company's attendance rules (OC7): the rules in force today, the dated history, and a sheet
	// to add a version from a date. Shown on `/admin/settings`; the form only to `roster.manage`.

	type Props = {
		versions: AttendanceRuleRowView[];
		today: ResolvedAttendanceRules;
		todayDate: string;
		form: SuperValidated<Infer<typeof attendanceRuleFormSchema>, StatusMessage> | null;
	};

	let { versions, today, todayDate, form }: Props = $props();

	let open = $state(false);

	const inForceFrom = $derived(
		today.versionId === null
			? null
			: (versions.find((v) => v.id === today.versionId)?.effectiveFrom ?? null)
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.attendance_rules_title()}</Card.Title>
		<Card.Description>{m.attendance_rules_description()}</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<dl class="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 text-sm">
			<dt class="text-muted-foreground">{m.attendance_rules_in_force()}</dt>
			<dd>
				{inForceFrom === null
					? m.attendance_rules_default_label()
					: m.attendance_rules_version_from({ date: inForceFrom })}
			</dd>
			<dt class="text-muted-foreground">{m.attendance_rules_col_rounding()}</dt>
			<dd>{roundingLabel(today.rules)}</dd>
			<dt class="text-muted-foreground">{m.attendance_rules_col_prayer()}</dt>
			<dd>{prayerLabel(today.rules)}</dd>
		</dl>

		<div class="flex flex-col gap-2">
			<h4 class="text-sm font-medium">{m.attendance_rules_history()}</h4>
			{#if versions.length === 0}
				<p class="text-sm text-muted-foreground">{m.attendance_rules_history_empty()}</p>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.attendance_rules_col_from()}</Table.Head>
							<Table.Head>{m.attendance_rules_col_until()}</Table.Head>
							<Table.Head>{m.attendance_rules_col_rounding()}</Table.Head>
							<Table.Head>{m.attendance_rules_col_prayer()}</Table.Head>
							<Table.Head>{m.attendance_rules_col_reason()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each versions as version (version.id)}
							<Table.Row>
								<Table.Cell
									><bdi dir="ltr" class="font-mono">{version.effectiveFrom}</bdi></Table.Cell
								>
								<Table.Cell>
									<bdi dir="ltr" class="font-mono">
										{version.effectiveTo ?? m.attendance_rules_open_end()}
									</bdi>
								</Table.Cell>
								<Table.Cell>{roundingLabel(version)}</Table.Cell>
								<Table.Cell>{prayerLabel(version)}</Table.Cell>
								<Table.Cell class="whitespace-normal">{version.reason}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</div>

		{#if form}
			<div>
				<Button variant="outline" onclick={() => (open = true)}>{m.attendance_rules_add()}</Button>
			</div>
			<AttendanceRuleFormSheet data={form} today={todayDate} bind:open />
		{/if}
	</Card.Content>
</Card.Root>
