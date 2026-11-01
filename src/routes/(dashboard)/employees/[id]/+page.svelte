<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import BriefcaseIcon from 'phosphor-svelte/lib/BriefcaseIcon';
	import CalendarBlankIcon from 'phosphor-svelte/lib/CalendarBlankIcon';
	import CalendarPlusIcon from 'phosphor-svelte/lib/CalendarPlusIcon';
	import ClockCounterClockwiseIcon from 'phosphor-svelte/lib/ClockCounterClockwiseIcon';
	import DeviceMobileIcon from 'phosphor-svelte/lib/DeviceMobileIcon';
	import FilesIcon from 'phosphor-svelte/lib/FilesIcon';
	import IdentificationCardIcon from 'phosphor-svelte/lib/IdentificationCardIcon';
	import ListBulletsIcon from 'phosphor-svelte/lib/ListBulletsIcon';
	import SlidersHorizontalIcon from 'phosphor-svelte/lib/SlidersHorizontalIcon';
	import StarIcon from 'phosphor-svelte/lib/StarIcon';
	import DayPanel from '#lib/app/attendance/DayPanel.svelte';
	import AssignSheet from '#lib/app/patterns/AssignSheet.svelte';
	import EndAssignmentSheet from '#lib/app/patterns/EndAssignmentSheet.svelte';
	import ScheduleSheet from '#lib/app/patterns/ScheduleSheet.svelte';
	import PatternHistory from '#lib/app/roster/PatternHistory.svelte';
	import CustodyPanel from '#lib/app/profile/CustodyPanel.svelte';
	import DocumentsPanel from '#lib/app/profile/DocumentsPanel.svelte';
	import ExperiencePanel from '#lib/app/profile/ExperiencePanel.svelte';
	import { profileTab, type ProfileTab } from '#lib/app/profile/labels.js';
	import PersonalPanel from '#lib/app/profile/PersonalPanel.svelte';
	import ProfileHeader from '#lib/app/profile/ProfileHeader.svelte';
	import ProfileOverview from '#lib/app/profile/ProfileOverview.svelte';
	import SkillsPanel from '#lib/app/profile/SkillsPanel.svelte';
	import PreviewRange from '#lib/app/roster/PreviewRange.svelte';
	import RosterPreview from '#lib/app/roster/RosterPreview.svelte';
	import { weekdayNames } from '#lib/app/roster/labels.js';
	import { previewDays } from '#lib/app/roster/preview.js';
	import StaffDetailsSheet from '#lib/app/staff/StaffDetailsSheet.svelte';
	import StaffListsHost from '#lib/app/staff-lists/StaffListsHost.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as UnderlineTabs from '#lib/components/ui/underline-tabs/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { punchDays } from '#lib/attendance/entry.js';
	import { m } from '#lib/paraglide/messages.js';
	import { lookupName, personName, teamName } from '#lib/utils/locale.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const person = $derived(data.person);
	const team = $derived(
		person.teamId && person.teamNameEn && person.teamNameAr
			? { id: person.teamId, nameEn: person.teamNameEn, nameAr: person.teamNameAr }
			: null
	);

	const staffId = $derived(data.person.staffId);
	/**
	 * The day open in the day panel (from `?day=`, or a click on the preview). Starts again from
	 * `?day=` when another person opens in this reused page, not when the preview is paged.
	 */
	let selectedDay = $derived.by<string | null>(() => {
		void staffId;
		return untrack(() => data.selectedDay);
	});
	const punches = $derived(punchDays(data.events));
	const days = $derived(previewDays(data.preview, person.staffId));
	const panelDay = $derived(selectedDay ? days.find((d) => d.date === selectedDay) : undefined);

	const patternNames = $derived(new Map(data.patterns.map((p) => [p.id, lookupName(p)])));
	const activePatterns = $derived(data.patterns.filter((p) => p.active));
	const schedule = $derived(data.schedule);
	const followedPattern = $derived(
		schedule.patternId ? (patternNames.get(schedule.patternId) ?? '—') : '—'
	);
	/** Own rules adjust a team's or department's pattern only. */
	const canHaveRules = $derived(schedule.follows === 'team' || schedule.follows === 'department');

	const weekdays = $derived(weekdayNames());
	const rulesText = $derived.by(() => {
		const parts: string[] = [];
		if (schedule.rules?.offWeekdays)
			parts.push(
				m.schedule_rules_off({
					days: schedule.rules.offWeekdays.map((d) => weekdays[d]).join(m.list_separator())
				})
			);
		if (schedule.rules?.crewStart !== null && schedule.rules?.crewStart !== undefined)
			parts.push(m.schedule_crew_start_option({ day: schedule.rules.crewStart + 1 }));
		return parts.join(m.list_separator());
	});

	let assignOpen = $state(false);
	let endOpen = $state(false);
	let scheduleOpen = $state(false);
	let detailsOpen = $state(false);

	/** The open tab lives in `?tab=` (V3); the load doesn't read it, so switching doesn't refetch. */
	const tab = $derived(
		profileTab(page.url.searchParams.get('tab'), page.url.searchParams.has('day'))
	);

	function setTab(next: string) {
		const url = new URL(page.url.href);
		url.searchParams.set('tab', next);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same page, only `?tab=` changes
		void goto(url, { replace: true, reset: false });
	}

	const name = $derived(personName(person));
</script>

<svelte:head>
	<title>{personName(person)} · {m.nav_employees()} · {m.app_name()}</title>
</svelte:head>

<StaffListsHost data={data.listForm} lists={data.lists}>
	<section class="flex flex-col gap-4">
		<Button href={localizedHref('/employees')} variant="ghost" size="sm" class="self-start">
			<ArrowLeftIcon data-icon="inline-start" class="rtl:rotate-180" />
			{m.roster_back_to_employees()}
		</Button>

		<ProfileHeader
			profile={data.profile}
			hasPersonalPattern={data.hasPersonalPattern}
			onEdit={() => (detailsOpen = true)}
		/>

		<UnderlineTabs.Root bind:value={() => tab, setTab}>
			<UnderlineTabs.List class="max-w-full overflow-x-auto">
				{@render trigger('overview', ListBulletsIcon, m.profile_tab_overview())}
				{@render trigger('schedule', CalendarBlankIcon, m.profile_tab_schedule())}
				{@render trigger('personal', IdentificationCardIcon, m.profile_tab_personal())}
				{@render trigger('experience', BriefcaseIcon, m.profile_experience_title())}
				{@render trigger('skills', StarIcon, m.profile_skills_title())}
				{@render trigger('documents', FilesIcon, m.profile_documents_title())}
				{@render trigger('custody', DeviceMobileIcon, m.profile_custody_title())}
				{@render trigger('history', ClockCounterClockwiseIcon, m.profile_tab_history())}
			</UnderlineTabs.List>

			<!-- Remounted per person, like the sheets below, so their forms hold this person. -->
			{#key person.staffId}
				<UnderlineTabs.Content value="overview" class="flex flex-col gap-4">
					<ProfileOverview profile={data.profile} onOpen={setTab} />
				</UnderlineTabs.Content>

				<UnderlineTabs.Content value="schedule" class="flex flex-col gap-4">
					<Card.Root>
						<Card.Header>
							<Card.Title>{m.person_schedule_title()}</Card.Title>
							<Card.Description>{m.person_schedule_description()}</Card.Description>
						</Card.Header>
						<Card.Content class="flex flex-col gap-4">
							<div class="flex flex-col gap-1 text-sm">
								<p>
									{#if schedule.follows === 'personal'}
										{m.person_follows_own({ name: followedPattern })}
									{:else if schedule.follows === 'team' && team}
										{m.person_follows_team({ team: teamName(team), name: followedPattern })}
									{:else if schedule.follows === 'department' && schedule.department}
										{m.person_follows_department({
											department: lookupName(schedule.department),
											name: followedPattern
										})}
									{:else}
										{m.person_follows_none()}
									{/if}
								</p>
								{#if canHaveRules}
									<p class="text-muted-foreground">
										{rulesText ? m.person_own_rules({ rules: rulesText }) : m.person_no_own_rules()}
									</p>
								{/if}
							</div>

							{#if data.canManage}
								<div class="flex flex-wrap gap-2">
									{#if canHaveRules}
										<Button variant="outline" size="sm" onclick={() => (scheduleOpen = true)}>
											<SlidersHorizontalIcon data-icon="inline-start" />
											{m.team_members_rules()}
										</Button>
									{/if}
									<Button variant="outline" size="sm" onclick={() => (assignOpen = true)}>
										<CalendarPlusIcon data-icon="inline-start" />
										{m.person_use_own_pattern()}
									</Button>
									{#if data.hasPersonalPattern}
										<Button variant="outline" size="sm" onclick={() => (endOpen = true)}>
											<ArrowCounterClockwiseIcon data-icon="inline-start" />
											{m.person_back_to_team()}
										</Button>
									{/if}
								</div>
							{/if}

							<div class="flex flex-col gap-3">
								<div class="flex flex-wrap items-center justify-between gap-2">
									<h3 class="font-medium">{m.roster_preview_title()}</h3>
									<PreviewRange
										from={data.preview.from}
										days={data.preview.days}
										today={data.today}
										keep={{ tab: 'schedule' }}
									/>
								</div>
								<RosterPreview
									rows={[{ id: person.staffId, label: personName(person), days }]}
									today={data.today}
									{punches}
									{selectedDay}
									onSelectDay={(date) => (selectedDay = selectedDay === date ? null : date)}
								/>
							</div>
						</Card.Content>
					</Card.Root>

					{#if panelDay}
						<Card.Root>
							<Card.Header>
								<Card.Title>{m.attendance_day_title()}</Card.Title>
								<Card.Description>{m.attendance_day_description()}</Card.Description>
							</Card.Header>
							<Card.Content>
								<!-- Keyed by person too: the add-pair form keeps the staff id it was opened with. -->
								{#key `${person.staffId}:${panelDay.date}`}
									<DayPanel
										staffId={person.staffId}
										day={panelDay}
										events={data.events.filter((e) => e.shiftDate === panelDay.date)}
										shifts={data.preview.shifts}
										canRecord={data.canRecord}
									/>
								{/key}
							</Card.Content>
						</Card.Root>
					{/if}
				</UnderlineTabs.Content>

				<UnderlineTabs.Content value="personal" class="flex flex-col gap-4">
					<PersonalPanel
						profile={data.profile}
						namesForm={data.namesForm}
						identityForm={data.identityForm}
						contactForm={data.contactForm}
						socialForm={data.socialForm}
						jobTitles={data.lists.jobTitles}
						{name}
					/>
				</UnderlineTabs.Content>

				<UnderlineTabs.Content value="experience" class="flex flex-col gap-4">
					<ExperiencePanel
						data={data.experienceForm}
						experience={data.profile.experience}
						totalMonths={data.profile.summary.experienceMonths}
						startDate={data.profile.person.startDate}
						{name}
					/>
				</UnderlineTabs.Content>

				<UnderlineTabs.Content value="skills" class="flex flex-col gap-4">
					<SkillsPanel
						data={data.skillForm}
						skills={data.profile.skills}
						list={data.lists.skills}
						{name}
					/>
				</UnderlineTabs.Content>

				<UnderlineTabs.Content value="documents" class="flex flex-col gap-4">
					<DocumentsPanel
						data={data.documentForm}
						documents={data.profile.documents}
						summary={data.profile.summary.documents}
						today={data.today}
						{name}
					/>
				</UnderlineTabs.Content>

				<UnderlineTabs.Content value="custody" class="flex flex-col gap-4">
					<CustodyPanel
						data={data.custodyForm}
						items={data.profile.custody}
						types={data.lists.custodyItemTypes}
						today={data.today}
						{name}
					/>
				</UnderlineTabs.Content>

				<UnderlineTabs.Content value="history" class="flex flex-col gap-4">
					<Card.Root>
						<Card.Header>
							<Card.Title>{m.roster_history_title()}</Card.Title>
						</Card.Header>
						<Card.Content class="px-0">
							<PatternHistory
								versions={data.versions}
								today={data.today}
								shifts={data.preview.shifts}
								{patternNames}
							/>
						</Card.Content>
					</Card.Root>
				</UnderlineTabs.Content>
			{/key}
		</UnderlineTabs.Root>
	</section>

	{#key person.staffId}
		<StaffDetailsSheet
			data={data.staffEditForm}
			{name}
			functions={data.functions}
			departments={data.departments}
			teams={data.teams}
			jobTitles={data.lists.jobTitles}
			bind:open={detailsOpen}
		/>
	{/key}
</StaffListsHost>

{#snippet trigger(value: ProfileTab, Icon: typeof ListBulletsIcon, label: string)}
	<UnderlineTabs.Trigger {value}>
		<Icon />
		{label}
	</UnderlineTabs.Trigger>
{/snippet}

{#if data.canManage}
	<!-- The page is reused from one person to the next: remount the sheets so their forms hold
	     this person. -->
	{#key person.staffId}
		<AssignSheet
			data={data.assignForm}
			action="?/assign"
			targetKind="staff"
			targetId={person.staffId}
			patterns={activePatterns}
			today={data.today}
			buildHref={`${localizedHref('/patterns/new')}?targetKind=staff&targetId=${person.staffId}`}
			title={m.person_use_own_pattern()}
			description={m.person_assign_description({ name: personName(person) })}
			bind:open={assignOpen}
		/>
		<EndAssignmentSheet
			data={data.endForm}
			action="?/endAssignment"
			today={data.today}
			title={m.person_back_to_team()}
			description={m.person_back_to_team_description()}
			bind:open={endOpen}
		/>
		<ScheduleSheet
			setData={data.scheduleForm}
			resetData={data.resetForm}
			setAction="?/setSchedule"
			resetAction="?/resetSchedule"
			staffId={person.staffId}
			name={personName(person)}
			patternType={schedule.patternType}
			cycleLength={schedule.cycleLength}
			current={schedule.rules}
			today={data.today}
			bind:open={scheduleOpen}
		/>
	{/key}
{/if}
