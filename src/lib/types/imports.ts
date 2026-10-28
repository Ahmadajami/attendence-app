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

/** `import_row.parsed`. */
export type ImportRowData = StaffImportData;

export type ImportRowDraft = {
	rowNo: number;
	raw: Record<string, string>;
	parsed: ImportRowData | null;
	errors: ImportIssue[];
	action: ImportAction;
	targetId: string | null;
};
