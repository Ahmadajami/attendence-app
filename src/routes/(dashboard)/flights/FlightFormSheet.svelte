<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import {
		defaultHandlingWindow,
		isHandlingOverride,
		shiftHandlingWindow,
		type HandlingWindow
	} from '#lib/flights/handling.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { FlightRow } from '#lib/types/flights.js';
	import { formatDamascusInput, parseDamascusInput } from '#lib/utils/datetime.js';
	import { endSide } from '#lib/utils/locale.js';
	import { directionLabel, statusLabel } from './labels.js';
	import { flightFormSchema, flightStatusValues, type FlightMessage } from './schema.js';

	type Props = {
		data: SuperValidated<Infer<typeof flightFormSchema>, FlightMessage>;
		/** The board's day (`YYYY-MM-DD`), used as the default date of a new flight. */
		day: string;
	};

	let { data, day }: Props = $props();

	let open = $state(false);
	let target = $state<FlightRow | null>(null);
	/** Set once the user edits the window by hand; until then it follows the time and direction. */
	let windowTouched = $state(false);

	const form = superForm(
		untrack(() => data),
		{
			validators: zod4Client(flightFormSchema),
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

	const storedWindow = $derived(
		target && {
			scheduledAt: target.scheduledAt,
			startsAt: target.handlingStartsAt,
			endsAt: target.handlingEndsAt
		}
	);

	/** The window is an override (needs a reason), by the same rule the server applies. */
	const needsReason = $derived.by(() => {
		const scheduledAt = parseDamascusInput($formData.scheduledAt);
		const startsAt = parseDamascusInput($formData.handlingStartsAt);
		const endsAt = parseDamascusInput($formData.handlingEndsAt);
		if (!scheduledAt || !startsAt || !endsAt) return false;
		return isHandlingOverride(
			{ scheduledAt, direction: $formData.direction, startsAt, endsAt },
			storedWindow ?? undefined
		);
	});

	/** A derived fill, not a user edit, so it doesn't taint the form. */
	function setWindow(window: HandlingWindow) {
		formData.update(
			(values) => ({
				...values,
				handlingStartsAt: formatDamascusInput(window.startsAt),
				handlingEndsAt: formatDamascusInput(window.endsAt)
			}),
			{ taint: false }
		);
	}

	/** New flight: the default window. Existing flight: its stored window moved with a reschedule. */
	async function followWindow() {
		await tick();
		if (windowTouched) return;
		const scheduledAt = parseDamascusInput($formData.scheduledAt);
		if (!scheduledAt) return;
		setWindow(
			storedWindow
				? shiftHandlingWindow(storedWindow, scheduledAt)
				: defaultHandlingWindow(scheduledAt, $formData.direction)
		);
	}

	function applyDefaultWindow() {
		const scheduledAt = parseDamascusInput($formData.scheduledAt);
		if (!scheduledAt) return;
		setWindow(defaultHandlingWindow(scheduledAt, $formData.direction));
		// On an existing flight, following would shift the stored window back in.
		windowTouched = storedWindow !== null;
	}

	/** Opens the sheet for a new flight (`null`) or to edit `flight`. Called by the flights page. */
	export function show(flight: FlightRow | null) {
		target = flight;
		windowTouched = false;
		form.reset({
			data: flight
				? {
						flightId: flight.id,
						airlineCode: flight.airlineCode,
						flightNo: flight.flightNo,
						direction: flight.direction,
						origin: flight.origin ?? '',
						destination: flight.destination ?? '',
						scheduledAt: formatDamascusInput(flight.scheduledAt),
						status: flight.status,
						aircraftType: flight.aircraftType ?? '',
						stand: flight.stand ?? '',
						gate: flight.gate ?? '',
						imageUrl: flight.imageUrl ?? '',
						handlingStartsAt: formatDamascusInput(flight.handlingStartsAt),
						handlingEndsAt: formatDamascusInput(flight.handlingEndsAt),
						overrideReason: ''
					}
				: { flightId: '', direction: 'arrival', status: 'scheduled', scheduledAt: `${day}T12:00` }
		});
		if (!flight) void followWindow();
		open = true;
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={endSide()} class="sm:max-w-xl">
		<Sheet.Header>
			<Sheet.Title>{target ? m.flights_edit() : m.flights_new()}</Sheet.Title>
			<Sheet.Description>
				{target ? m.flights_edit_description() : m.flights_create_description()}
			</Sheet.Description>
		</Sheet.Header>

		<form
			method="POST"
			action="?/save"
			class="flex flex-col gap-4 overflow-y-auto px-4 pb-4"
			use:enhance
		>
			<input type="hidden" name="flightId" value={$formData.flightId} />

			<div class="grid gap-4 sm:grid-cols-3">
				<Form.Field {form} name="airlineCode">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.flights_field_airline()}</Form.Label>
							<Input {...props} bind:value={$formData.airlineCode} dir="ltr" autocomplete="off" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="flightNo">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.flights_field_number()}</Form.Label>
							<Input {...props} bind:value={$formData.flightNo} dir="ltr" autocomplete="off" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="direction">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.flights_field_direction()}</Form.Label>
							<Select.Root
								type="single"
								name={props.name}
								bind:value={$formData.direction}
								onValueChange={followWindow}
							>
								<Select.Trigger {...props} class="w-full">
									{directionLabel($formData.direction)}
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="arrival" label={directionLabel('arrival')} />
									<Select.Item value="departure" label={directionLabel('departure')} />
								</Select.Content>
							</Select.Root>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<Form.Field {form} name="scheduledAt">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.flights_field_scheduled()}</Form.Label>
							<Input
								{...props}
								type="datetime-local"
								bind:value={$formData.scheduledAt}
								oninput={followWindow}
								dir="ltr"
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="status">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.flights_field_status()}</Form.Label>
							<Select.Root type="single" name={props.name} bind:value={$formData.status}>
								<Select.Trigger {...props} class="w-full">
									{statusLabel($formData.status)}
								</Select.Trigger>
								<Select.Content>
									{#each flightStatusValues as status (status)}
										<Select.Item value={status} label={statusLabel(status)} />
									{/each}
								</Select.Content>
							</Select.Root>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<Form.Field {form} name="origin">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.flights_field_origin()}</Form.Label>
							<Input {...props} bind:value={$formData.origin} dir="ltr" autocomplete="off" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="destination">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.flights_field_destination()}</Form.Label>
							<Input {...props} bind:value={$formData.destination} dir="ltr" autocomplete="off" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<div class="grid gap-4 sm:grid-cols-3">
				<Form.Field {form} name="aircraftType">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.flights_field_aircraft()}</Form.Label>
							<Input {...props} bind:value={$formData.aircraftType} dir="ltr" autocomplete="off" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="stand">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.flights_field_stand()}</Form.Label>
							<Input {...props} bind:value={$formData.stand} dir="ltr" autocomplete="off" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="gate">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.flights_field_gate()}</Form.Label>
							<Input {...props} bind:value={$formData.gate} dir="ltr" autocomplete="off" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>
			</div>

			<Form.Field {form} name="imageUrl">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>{m.flights_field_image()}</Form.Label>
						<Input
							{...props}
							bind:value={$formData.imageUrl}
							dir="ltr"
							inputmode="url"
							placeholder="https://"
							autocomplete="off"
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<div class="flex flex-col gap-3 border-t pt-4">
				<div class="flex items-center justify-between gap-2">
					<p class="text-sm font-medium">{m.flights_field_window()}</p>
					<Button type="button" variant="outline" size="sm" onclick={applyDefaultWindow}>
						{m.flights_use_default_window()}
					</Button>
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<Form.Field {form} name="handlingStartsAt">
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>{m.flights_field_window_start()}</Form.Label>
								<Input
									{...props}
									type="datetime-local"
									bind:value={$formData.handlingStartsAt}
									oninput={() => (windowTouched = true)}
									dir="ltr"
								/>
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>

					<Form.Field {form} name="handlingEndsAt">
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>{m.flights_field_window_end()}</Form.Label>
								<Input
									{...props}
									type="datetime-local"
									bind:value={$formData.handlingEndsAt}
									oninput={() => (windowTouched = true)}
									dir="ltr"
								/>
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>

				{#if needsReason}
					<Form.Field {form} name="overrideReason">
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>{m.flights_field_override_reason()}</Form.Label>
								<Textarea {...props} bind:value={$formData.overrideReason} rows={2} />
							{/snippet}
						</Form.Control>
						<Form.Description>{m.flights_override_reason_description()}</Form.Description>
						<Form.FieldErrors />
					</Form.Field>
				{/if}
			</div>

			<Form.Button class="w-full" disabled={$delayed}>
				{#if $delayed}
					<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
				{/if}
				{target ? m.flights_save() : m.flights_create_submit()}
			</Form.Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
