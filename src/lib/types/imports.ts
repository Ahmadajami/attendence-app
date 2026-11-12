export type ImportAction = 'create' | 'update' | 'skip';

/** A row problem stored in `import_row.errors`; the UI maps `code` to a localized message. */
export type ImportIssue = {
	field: string;
	code: string;
	value?: string;
};

export type StaffImportData = {
	employeeNo: string;
	fullName: string;
	fullNameAr: string | null;
	phone: string | null;
	functionId: string;
	teamId: string | null;
};

/** A punch file line (plan 2026-11-11 attendance import, IM3): a punch part or a full-day state. */
export type PunchImportData = {
	line: 'punch' | 'state';
	employeeNo: string;
	/** `null` when the employee number matches no active person. */
	staffId: string | null;
	date: string;
	checkIn: string | null;
	checkOut: string | null;
	/** `sick` / `leave` / `mission` on a state line (health data: shown only as "full-day state"). */
	state: 'sick' | 'leave' | 'mission' | null;
	/** The roster's planned shift on the date (`null`: a day off, or not known). */
	plannedShiftId: string | null;
	plannedShiftCode: string | null;
	/** Why a skipped line was skipped (`already_imported`, `duplicate`). */
	skipReason: string | null;
	/** Pair warnings (day off, outside the shift…) and `state_with_punches`. */
	warnings: string[];
	/** The events this line inserts on commit (instants as ISO text). */
	events: { type: 'check_in' | 'check_out'; at: string }[];
};

/** A shifts file line (plan 2026-11-12-roster-import, RI2). */
export type ShiftImportData = {
	line: 'shift';
	code: string;
	nameEn: string;
	nameAr: string;
	colour: string;
	startTime: string;
	endTime: string;
	breakMinutes: number;
	requiredMinutes: number | null;
	/** `same_as_app`: the app already has this code with these times. */
	skipReason: string | null;
};

/** A roster grid line: one person's month (plan 2026-11-12-roster-import, RI3, RI4). */
export type RosterImportData = {
	line: 'roster';
	employeeNo: string;
	staffId: string | null;
	/** The group's label (department, else team) and key. */
	group: string;
	groupKey: string;
	plannedDays: number;
	/** Own off days (0 = Sunday) when they differ from the group's; `null`: the group's. */
	ownOffWeekdays: number[] | null;
	/** The personal pattern's name when the person is on another shift. */
	personalPattern: string | null;
	swaps: number;
	dayEdits: number;
	/** Days whose replay through the roster doesn't give the file (must be 0 to save). */
	mismatches: number;
};

/** `import_row.parsed`. */
export type ImportRowData = StaffImportData | PunchImportData | ShiftImportData | RosterImportData;

/** A shifts batch's counts. */
export type ShiftBatchSummary = {
	kind: 'shifts';
	create: number;
	same: number;
	refused: Record<string, number>;
	/** After an undo. */
	deactivated?: number;
};

/** One group of a roster batch: what the save creates for it. */
export type RosterGroupSummary = {
	key: string;
	label: string;
	kind: 'department' | 'team';
	targetId: string | null;
	people: number;
	/** People of the department (or team) the file doesn't list: the pattern plans them too. */
	unlisted: number;
	patternName: string | null;
	/** The group joins the pattern it already has in the month (RI11): `patternName` is that one. */
	joined?: boolean;
	/** Weekly slots, Sunday first: shift codes or `O`. */
	slots: string[];
	ownRules: number;
	personal: { name: string; slots: string[]; people: number }[];
	swaps: number;
	dayEdits: number;
	mismatches: number;
	/** Why the whole group is refused (it already has a roster in the month, a name is taken…). */
	refused: string | null;
};

/** A roster batch's preview (counts and record ids only). */
export type RosterBatchSummary = {
	kind: 'roster';
	from: string;
	to: string;
	people: number;
	groups: RosterGroupSummary[];
	patterns: number;
	ownRules: number;
	swaps: number;
	dayEdits: number;
	mismatches: number;
	refused: Record<string, number>;
	/** After an undo. */
	undone?: {
		patterns: number;
		assignments: number;
		rules: number;
		dayEdits: number;
		swaps: number;
	};
};

/** `import_batch.summary`: a punch, shifts or roster batch's counts. */
export type ImportBatchSummary = PunchBatchSummary | ShiftBatchSummary | RosterBatchSummary;

/** A punch batch's preview counts (`import_batch.summary`); counts and dates only. */
export type PunchBatchSummary = {
	from: string | null;
	to: string | null;
	/** Lines read; `lines` = import + skipped + refused (+ `empty`, lines with nothing on them). */
	lines: number;
	empty: number;
	people: number;
	pairs: number;
	events: number;
	states: number;
	/** Absences the states become (consecutive days of one person and state join). */
	absences: number;
	dayOff: number;
	warned: number;
	skipped: Record<string, number>;
	refused: Record<string, number>;
	warnings: Record<string, number>;
	/** After an undo: what it removed. */
	undone?: { events: number; absences: number };
};

export type ImportRowDraft = {
	rowNo: number;
	raw: Record<string, string>;
	parsed: ImportRowData | null;
	errors: ImportIssue[];
	action: ImportAction;
	targetId: string | null;
};
