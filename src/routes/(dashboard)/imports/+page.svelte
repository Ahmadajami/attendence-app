<script lang="ts">
	import FileArrowDownIcon from 'phosphor-svelte/lib/FileArrowDownIcon';
	import UploadSimpleIcon from 'phosphor-svelte/lib/UploadSimpleIcon';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { formatDateTime } from '#lib/utils/datetime.js';
	import { personName } from '#lib/utils/locale.js';
	import { kindLabel, statusLabel } from './labels.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const KINDS = ['staff', 'punches'] as const;
	let kind = $state<string>('staff');
</script>

<svelte:head>
	<title>{m.imports_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<h2 class="text-2xl font-semibold tracking-tight">{m.imports_title()}</h2>
		<p class="max-w-prose text-muted-foreground">{m.imports_description()}</p>
	</div>

	<div class="grid gap-4 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.imports_upload_title()}</Card.Title>
				<Card.Description>{m.imports_upload_description()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/preview"
					enctype="multipart/form-data"
					class="flex flex-col gap-4"
				>
					<div class="flex flex-col gap-1.5">
						<Label for="kind">{m.imports_kind()}</Label>
						<Select.Root type="single" name="kind" bind:value={kind}>
							<Select.Trigger id="kind" class="w-full">{kindLabel(kind)}</Select.Trigger>
							<Select.Content>
								{#each KINDS as option (option)}
									<Select.Item value={option} label={kindLabel(option)} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					<div class="flex flex-col gap-1.5">
						<Label for="file">{m.imports_file()}</Label>
						<Input
							id="file"
							name="file"
							type="file"
							accept=".xlsx,.md,.markdown"
							required
							class="h-9 py-1.5"
						/>
						<p class="text-xs text-muted-foreground">{m.imports_file_hint()}</p>
					</div>

					{#if form?.error}
						<p class="text-sm text-destructive" role="alert">{form.error}</p>
					{/if}

					<Button type="submit" class="w-full">
						<UploadSimpleIcon data-icon="inline-start" />
						{m.imports_preview()}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.imports_templates_title()}</Card.Title>
				<Card.Description>{m.imports_templates_description()}</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-2">
				<Button
					variant="outline"
					href={localizedHref('/imports/template/[kind]', { kind: 'staff' })}
					download
				>
					<FileArrowDownIcon data-icon="inline-start" />
					{m.imports_template_staff()}
				</Button>
				<Button
					variant="outline"
					href={localizedHref('/imports/template/[kind]', { kind: 'punches' })}
					download
				>
					<FileArrowDownIcon data-icon="inline-start" />
					{m.imports_template_punches()}
				</Button>
			</Card.Content>
		</Card.Root>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.imports_history()}</Card.Title>
			<Card.Description>{m.imports_history_description()}</Card.Description>
		</Card.Header>
		<Card.Content class="px-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.imports_col_file()}</Table.Head>
						<Table.Head>{m.imports_col_kind()}</Table.Head>
						<Table.Head>{m.imports_col_status()}</Table.Head>
						<Table.Head>{m.imports_col_uploaded()}</Table.Head>
						<Table.Head>{m.imports_col_rows()}</Table.Head>
						<Table.Head><span class="sr-only">{m.imports_open()}</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.batches as batch (batch.id)}
						<Table.Row>
							<Table.Cell class="max-w-56 truncate font-medium" dir="ltr"
								>{batch.fileName}</Table.Cell
							>
							<Table.Cell>{kindLabel(batch.kind)}</Table.Cell>
							<Table.Cell>
								<Badge variant={batch.status === 'committed' ? 'secondary' : 'outline'}>
									{statusLabel(batch.status)}
								</Badge>
							</Table.Cell>
							<Table.Cell>
								<div class="flex flex-col gap-0.5">
									<div><bdi>{formatDateTime(batch.createdAt)}</bdi></div>
									<div class="text-xs text-muted-foreground">
										{batch.createdByUser ? personName(batch.createdByUser) : '—'}
									</div>
								</div>
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap">
								{m.imports_row_counts({
									create: batch.createCount,
									update: batch.updateCount,
									skip: batch.skipCount,
									errors: batch.errorCount
								})}
							</Table.Cell>
							<Table.Cell class="text-end">
								<Button
									variant="ghost"
									size="sm"
									href={localizedHref('/imports/[id]', { id: batch.id })}
								>
									{m.imports_open()}
								</Button>
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={6} class="h-20 text-center text-muted-foreground">
								{m.imports_no_batches()}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</section>
