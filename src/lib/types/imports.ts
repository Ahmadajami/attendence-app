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

/** `import_row.parsed`. */
export type ImportRowData = StaffImportData | PunchImportData;

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
