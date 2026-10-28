<script lang="ts">
	import { tick } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { DateFormatter, parseDate } from '@internationalized/date';
	import { toast } from 'svelte-sonner';
	import AirplaneLandingIcon from 'phosphor-svelte/lib/AirplaneLandingIcon';
	import AirplaneTakeoffIcon from 'phosphor-svelte/lib/AirplaneTakeoffIcon';
	import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import XCircleIcon from 'phosphor-svelte/lib/XCircleIcon';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { FlightRow } from '#lib/types/flights.js';
	import { AIRPORT_TIME_ZONE, formatTime } from '#lib/utils/datetime.js';
	import { teamName } from '#lib/utils/locale.js';
	import type { PageProps } from './$types';
	import FlightFormSheet from './FlightFormSheet.svelte';
	import { directionLabel, flightName, statusLabel, statusVariant } from './labels.js';

	let { data }: PageProps = $props();

	let sheet = $state<ReturnType<typeof FlightFormSheet>>();

	const dayDate = $derived(parseDate(data.day));
	const dayLabel = $derived(
		new DateFormatter(getLocale(), {
			dateStyle: 'full',
			timeZone: AIRPORT_TIME_ZONE
		}).format(dayDate.toDate(AIRPORT_TIME_ZONE))
	);
	const dayHref = (day: string) => `${localizedHref('/flights')}?day=${day}`;
	const prevHref = $derived(dayHref(dayDate.subtract({ days: 1 }).toString()));
	const nextHref = $derived(dayHref(dayDate.add({ days: 1 }).toString()));

	function openCreate() {
		sheet?.show(null);
	}

	function openEdit(flight: FlightRow) {
		sheet?.show(flight);
	}

	let cancelForm: HTMLFormElement | null = $state(null);
	let cancelId = $state('');

	async function cancel(flight: FlightRow) {
		if (flight.status === 'cancelled') return;
		cancelId = flight.id;
		await tick();
		cancelForm?.requestSubmit();
	}

	const toastNotice: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success' || result.type === 'failure') {
				const notice = result.data?.notice;
				if (typeof notice === 'string') {
					if (result.type === 'success') toast.success(notice);
					else toast.error(notice);
				}
			}
			await update();
		};
	};
</script>

<svelte:head>
	<title>{m.flights_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-1">
			<h2 class="text-2xl font-semibold tracking-tight">{m.flights_title()}</h2>
			<p class="max-w-prose text-muted-foreground">{m.flights_description()}</p>
		</div>
		{#if data.canWrite}
			<Button onclick={openCreate}>
				<PlusIcon data-icon="inline-start" />
				{m.flights_new()}
			</Button>
		{/if}
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<Button variant="outline" size="icon-sm" href={prevHref} aria-label={m.flights_previous_day()}>
			<CaretLeftIcon class="rtl:rotate-180" />
		</Button>
		<form method="GET" action={localizedHref('/flights')} class="flex items-center gap-2">
			<label class="sr-only" for="day">{m.flights_day()}</label>
			<Input id="day" name="day" type="date" value={data.day} class="w-auto" />
			<Button type="submit" variant="outline" size="sm">{m.flights_go()}</Button>
		</form>
		<Button variant="outline" size="icon-sm" href={nextHref} aria-label={m.flights_next_day()}>
			<CaretRightIcon class="rtl:rotate-180" />
		</Button>
		<Button variant="ghost" size="sm" href={localizedHref('/flights')}>
			{m.flights_today()}
		</Button>
		<span class="ms-auto text-sm text-muted-foreground"><bdi>{dayLabel}</bdi></span>
	</div>

	<Card.Root>
		<Card.Content class="px-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-14"
							><span class="sr-only">{m.flights_col_image()}</span></Table.Head
						>
						<Table.Head>{m.flights_col_flight()}</Table.Head>
						<Table.Head>{m.flights_col_direction()}</Table.Head>
						<Table.Head>{m.flights_col_route()}</Table.Head>
						<Table.Head>{m.flights_col_time()}</Table.Head>
						<Table.Head>{m.flights_col_status()}</Table.Head>
						<Table.Head>{m.flights_col_team()}</Table.Head>
						{#if data.canWrite}
							<Table.Head><span class="sr-only">{m.flights_actions()}</span></Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.flights as flight (flight.id)}
						<Table.Row>
							<Table.Cell>
								{#if flight.imageUrl}
									<img
										src={flight.imageUrl}
										alt=""
										class="size-9 object-contain"
										loading="lazy"
										referrerpolicy="no-referrer"
									/>
								{:else}
									<div
										class="flex size-9 items-center justify-center bg-muted text-xs font-semibold text-muted-foreground"
										dir="ltr"
										aria-hidden="true"
									>
										{flight.airlineCode}
									</div>
								{/if}
							</Table.Cell>
							<Table.Cell>
								<div class="font-medium" dir="ltr">{flightName(flight)}</div>
								{#if flight.aircraftType}
									<div class="text-xs text-muted-foreground" dir="ltr">
										{flight.aircraftType}
									</div>
								{/if}
							</Table.Cell>
							<Table.Cell>
								<Badge variant="outline">
									{#if flight.direction === 'arrival'}
										<AirplaneLandingIcon />
									{:else}
										<AirplaneTakeoffIcon />
									{/if}
									{directionLabel(flight.direction)}
								</Badge>
							</Table.Cell>
							<Table.Cell>
								<bdi dir="ltr" class="font-mono text-xs">
									{flight.origin ?? '—'} → {flight.destination ?? '—'}
								</bdi>
							</Table.Cell>
							<Table.Cell>
								<div class="font-medium"><bdi>{formatTime(flight.scheduledAt)}</bdi></div>
								<div class="text-xs text-muted-foreground">
									<bdi>
										{formatTime(flight.handlingStartsAt)}–{formatTime(flight.handlingEndsAt)}
									</bdi>
								</div>
							</Table.Cell>
							<Table.Cell>
								<Badge variant={statusVariant(flight.status)}>{statusLabel(flight.status)}</Badge>
							</Table.Cell>
							<Table.Cell>
								{#if flight.team}
									{teamName(flight.team)}
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
							</Table.Cell>
							{#if data.canWrite}
								<Table.Cell class="text-end">
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button
													{...props}
													variant="ghost"
													size="icon"
													aria-label={m.flights_actions_for({ flight: flightName(flight) })}
												>
													<DotsThreeIcon />
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											<DropdownMenu.Item onSelect={() => openEdit(flight)}>
												<PencilSimpleIcon />
												{m.flights_edit()}
											</DropdownMenu.Item>
											{#if flight.status !== 'cancelled'}
												<DropdownMenu.Separator />
												<DropdownMenu.Item variant="destructive" onSelect={() => cancel(flight)}>
													<XCircleIcon />
													{m.flights_cancel()}
												</DropdownMenu.Item>
											{/if}
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</Table.Cell>
							{/if}
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell
								colspan={data.canWrite ? 8 : 7}
								class="h-24 text-center text-muted-foreground"
							>
								{m.flights_empty()}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</section>

<form bind:this={cancelForm} method="POST" action="?/cancel" use:enhance={toastNotice} hidden>
	<input type="hidden" name="flightId" value={cancelId} />
</form>

<FlightFormSheet bind:this={sheet} data={data.form} day={data.day} />
