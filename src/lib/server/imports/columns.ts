import { toAsciiDigits } from '#lib/schemas/auth.schema.js';

/** One import field and the headers we accept for it. The first header is our template header. */
export type ColumnSpec<Field extends string> = {
	field: Field;
	headers: string[];
};

export type StaffField =
	'employee_no' | 'full_name' | 'full_name_ar' | 'phone' | 'function' | 'team';

export type FlightField =
	| 'airline_code'
	| 'flight_no'
	| 'direction'
	| 'origin'
	| 'destination'
	| 'scheduled_at'
	| 'aircraft_type'
	| 'stand'
	| 'gate'
	| 'image_url'
	| 'team';

/**
 * The single place to edit for a real Odoo export. Headers are matched after normalisation
 * (case, spaces, underscores, punctuation and Arabic-Indic digits are ignored).
 */
export const STAFF_COLUMNS: ColumnSpec<StaffField>[] = [
	{
		field: 'employee_no',
		headers: [
			'employee_no',
			'employee no',
			'employee number',
			'employee id',
			'badge id',
			'barcode',
			'id',
			'الرقم الوظيفي',
			'رقم الموظف'
		]
	},
	{
		field: 'full_name',
		headers: ['full_name', 'full name', 'employee name', 'name', 'الاسم', 'اسم الموظف']
	},
	{
		field: 'full_name_ar',
		headers: ['full_name_ar', 'full name ar', 'arabic name', 'الاسم بالعربية', 'الاسم العربي']
	},
	{
		field: 'phone',
		headers: [
			'phone',
			'work mobile',
			'mobile phone',
			'work phone',
			'الهاتف',
			'الجوال',
			'رقم الهاتف'
		]
	},
	{
		field: 'function',
		headers: [
			'function',
			'job position',
			'job title',
			'department',
			'الوظيفة',
			'القسم',
			'المسمى الوظيفي'
		]
	},
	{ field: 'team', headers: ['team', 'الفريق', 'فريق'] }
];

export const FLIGHT_COLUMNS: ColumnSpec<FlightField>[] = [
	{
		field: 'airline_code',
		headers: ['airline_code', 'airline code', 'airline', 'carrier', 'رمز الشركة', 'شركة الطيران']
	},
	{
		field: 'flight_no',
		headers: ['flight_no', 'flight no', 'flight number', 'flight', 'رقم الرحلة', 'الرحلة']
	},
	{ field: 'direction', headers: ['direction', 'نوع الرحلة', 'الاتجاه'] },
	{ field: 'origin', headers: ['origin', 'from', 'من', 'المصدر'] },
	{ field: 'destination', headers: ['destination', 'to', 'إلى', 'الوجهة'] },
	{
		field: 'scheduled_at',
		headers: [
			'scheduled_at',
			'scheduled at',
			'scheduled',
			'scheduled date time',
			'datetime',
			'date time',
			'sta',
			'std',
			'الموعد المجدول',
			'التاريخ والوقت'
		]
	},
	{
		field: 'aircraft_type',
		headers: ['aircraft_type', 'aircraft type', 'aircraft', 'نوع الطائرة']
	},
	{ field: 'stand', headers: ['stand', 'الموقف'] },
	{ field: 'gate', headers: ['gate', 'البوابة'] },
	{
		field: 'image_url',
		headers: ['image_url', 'image url', 'image', 'logo', 'رابط الصورة', 'الصورة']
	},
	{ field: 'team', headers: ['team', 'الفريق', 'فريق'] }
];

/** Lowercase, ASCII digits, no punctuation, single spaces. */
export function normalizeText(value: string): string {
	return toAsciiDigits(value)
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[\u0640]/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

/** Map each field to the column index that matched one of its aliases. */
export function mapColumns<Field extends string>(
	headers: string[],
	specs: ColumnSpec<Field>[]
): Map<Field, number> {
	const normalized = headers.map(normalizeText);
	const result = new Map<Field, number>();
	for (const spec of specs) {
		const aliases = new Set(spec.headers.map(normalizeText));
		const index = normalized.findIndex((header) => aliases.has(header));
		if (index >= 0) result.set(spec.field, index);
	}
	return result;
}

/** The first (canonical) header for each field, used by the downloadable templates. */
export function templateHeaders<Field extends string>(specs: ColumnSpec<Field>[]): string[] {
	return specs.map((spec) => spec.headers[0]);
}
