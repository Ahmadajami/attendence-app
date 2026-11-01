<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Infer, SuperValidated } from 'sveltekit-superforms';
	import type {
		StaffListKind,
		StaffListMessage,
		staffListFormSchema
	} from '#lib/schemas/staff-lists.schema.js';
	import type { StaffListOption } from '#lib/types/profile.js';
	import type { StaffLists } from '#lib/types/staff-lists.js';
	import { setStaffLists } from './context.js';
	import ListItemSheet from './ListItemSheet.svelte';
	import ListManageSheet from './ListManageSheet.svelte';

	type Props = {
		/** The page's `staff-list` form (`staffListForm()`); the page mounts `saveListItem` and
		 * `setListItemActive`. */
		data: SuperValidated<Infer<typeof staffListFormSchema>, StaffListMessage>;
		lists: StaffLists;
		children: Snippet;
	};

	let { data, lists, children }: Props = $props();

	const ITEMS: Record<StaffListKind, keyof StaffLists> = {
		job_title: 'jobTitles',
		skill: 'skills',
		document_type: 'documentTypes',
		custody_item_type: 'custodyItemTypes'
	};

	let itemOpen = $state(false);
	let itemKind = $state<StaffListKind>('job_title');
	let itemTarget = $state<StaffListOption | null>(null);
	let itemSaved = $state<((item: StaffListOption) => void) | undefined>();

	let manageOpen = $state(false);
	let manageKind = $state<StaffListKind>('job_title');

	function openItem(
		kind: StaffListKind,
		target: StaffListOption | null,
		onSaved?: (item: StaffListOption) => void
	) {
		itemKind = kind;
		itemTarget = target;
		itemSaved = onSaved;
		itemOpen = true;
	}

	setStaffLists({
		create: (kind, onSaved) => openItem(kind, null, onSaved),
		manage: (kind) => {
			manageKind = kind;
			manageOpen = true;
		}
	});
</script>

{@render children()}

<!-- One create / rename sheet per page: every picker shares the superform id `staff-list`. -->
<ListItemSheet
	{data}
	kind={itemKind}
	target={itemTarget}
	onSaved={(item) => itemSaved?.(item)}
	bind:open={itemOpen}
/>
<ListManageSheet
	kind={manageKind}
	items={lists[ITEMS[manageKind]]}
	onEdit={(item) => openItem(manageKind, item)}
	bind:open={manageOpen}
/>
