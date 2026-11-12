<script lang="ts">
	import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRightIcon';
	import AttendanceRulesCard from '#lib/app/attendance/AttendanceRulesCard.svelte';
	import HolidayCard from '#lib/app/patterns/HolidayCard.svelte';
	import PayRuleCard from '#lib/app/patterns/PayRuleCard.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { OVERTIME_DEFAULTS } from '#lib/payroll/pay-rule.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{m.settings_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-col gap-1">
		<h2 class="text-2xl font-semibold tracking-tight">{m.settings_title()}</h2>
		<p class="max-w-prose text-muted-foreground">{m.settings_description()}</p>
	</div>

	<Card.Root class="max-w-2xl">
		<Card.Header>
			<Card.Title>{m.settings_shifts_title()}</Card.Title>
			<Card.Description>{m.settings_shifts_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button href={localizedHref('/shifts')} variant="outline">
				{m.settings_shifts_link()}
				<ArrowRightIcon data-icon="inline-end" class="rtl:rotate-180" />
			</Button>
		</Card.Content>
	</Card.Root>

	<!-- Company overtime and holidays (pay plan PR35–PR38); patterns override them on their tabs. -->
	<div class="flex flex-col gap-1">
		<h3 class="text-xl font-semibold tracking-tight">{m.settings_pay_title()}</h3>
		<p class="max-w-prose text-muted-foreground">{m.settings_pay_description()}</p>
	</div>

	<PayRuleCard
		pay={data.pay}
		inherited={OVERTIME_DEFAULTS}
		inheritLabel={m.pattern_pay_source_default()}
		title={m.company_pay_title()}
		description={m.company_pay_description()}
		empty={m.company_pay_versions_none()}
		forms={data.payForms && { rule: data.payForms.rule, reset: data.payForms.reset }}
		today={data.today}
	/>

	<HolidayCard
		holidays={data.pay.holidays}
		forms={data.payForms && {
			holiday: data.payForms.holiday,
			holidayCancel: data.payForms.holidayCancel
		}}
		title={m.company_holiday_title()}
		description={m.company_holiday_description()}
		today={data.today}
	/>

	<!-- Attendance rules from a date (OC7): overtime rounding and the Friday Prayer credit. -->
	<AttendanceRulesCard
		versions={data.attendance.versions}
		today={data.attendance.today}
		todayDate={data.today}
		form={data.attendanceForm}
	/>
</section>
