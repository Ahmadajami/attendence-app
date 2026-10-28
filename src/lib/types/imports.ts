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

export type FlightImportData = {
	airlineCode: string;
	flightNo: string;
	direction: 'arrival' | 'departure';
	origin: string | null;
	destination: string | null;
	scheduledAt: string;
	aircraftType: string | null;
	stand: string | null;
	gate: string | null;
	imageUrl: string | null;
	handlingStartsAt: string;
	handlingEndsAt: string;
	externalRef: string;
	source: 'import';
	/** Provided team to assign; `null` leaves any existing assignment unchanged. */
	teamId: string | null;
};

/** `import_row.parsed`. The two shapes are told apart by `'employeeNo' in data` / `'flightNo' in data`. */
export type ImportRowData = StaffImportData | FlightImportData;

export type ImportRowDraft = {
	rowNo: number;
	raw: Record<string, string>;
	parsed: ImportRowData | null;
	errors: ImportIssue[];
	action: ImportAction;
	targetId: string | null;
};
