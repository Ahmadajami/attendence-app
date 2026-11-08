// Proposed Arabic names for the departments, teams and job titles the employee import creates
// (plan 2026-11-08, Q-EI9: the agent proposes, the user corrects). Organisation names only, no
// people. Keys are the English names as they appear in HR's workbook; `planImport` matches them
// through `nameKey`, so case and punctuation do not matter. A name missing here falls back to
// the English one and is reported as `missing_arabic_name`.
import { nameKey, type ArabicNames } from './employee-seed.js';

const keyed = (entries: Record<string, string>) =>
	Object.fromEntries(Object.entries(entries).map(([en, ar]) => [nameKey(en), ar]));

export const EMPLOYEE_IMPORT_ARABIC: ArabicNames = {
	departments: keyed({
		'Station Damascus': 'محطة دمشق',
		'Station Aleppo': 'محطة حلب',
		Operations: 'العمليات',
		'Human Resources': 'الموارد البشرية',
		IT: 'تقنية المعلومات',
		Finance: 'المالية',
		Commercial: 'التجاري',
		'Quality Assurance': 'ضمان الجودة',
		'DAM Porters && Drivers': 'حمّالو وسائقو دمشق',
		'A-Jet Aleppo': 'AJet حلب',
		FlyDubi: 'فلاي دبي',
		QATAR: 'القطرية',
		'AirArabia Aleppo': 'العربية للطيران حلب',
		AirArabia: 'العربية للطيران',
		Turkish: 'التركية',
		Pegasus: 'بيغاسوس',
		'Porter Aleppo': 'حمّالو حلب',
		'FlyDubi Aleppo': 'فلاي دبي حلب',
		'Turkish Aleppo': 'التركية حلب',
		'Etihad Airways': 'الاتحاد للطيران',
		'SunExpress Aleppo': 'صن إكسبرس حلب',
		'HR & Admin': 'الموارد البشرية والإدارة',
		Accounting: 'المحاسبة'
	}),
	teams: keyed({
		'All-Porter': 'جميع الحمّالين',
		'Air Arabia': 'العربية للطيران',
		Etihad: 'الاتحاد',
		All: 'الكل',
		Admin: 'الإدارة',
		Flydubai: 'فلاي دبي',
		'Cleaning cabin': 'تنظيف المقصورات',
		'Qatar Airways': 'القطرية',
		'Qatar Airways (B)': 'القطرية (B)',
		'Turkish & AJET': 'التركية وAJet',
		'Turkish & AJET(A)': 'التركية وAJet (A)',
		Pegasus: 'بيغاسوس',
		'Flay Doubi': 'فلاي دوبي',
		SunExpress: 'صن إكسبرس',
		Operations: 'العمليات',
		Accounting: 'المحاسبة',
		HR: 'الموارد البشرية',
		Driver: 'السائقون',
		'Turkish Airline': 'الخطوط التركية',
		Management: 'الإدارة العليا',
		Family: 'العائلة',
		IT: 'تقنية المعلومات',
		Marketing: 'التسويق',
		Procurement: 'المشتريات',
		'Voyage Royale': 'فوياج رويال',
		'Credit Control': 'مراقبة الائتمان',
		Quality: 'الجودة'
	}),
	jobTitles: keyed({
		'Porters (OP1111-1)': 'حمّالون (OP1111-1)',
		'Check-In Agent (OP1121-1)': 'موظف تسجيل الوصول (OP1121-1)',
		'Check-In Agent - Aleppo (OP1143-1)': 'موظف تسجيل الوصول - حلب (OP1143-1)',
		'Porters - Aleppo (OP1141-2)': 'حمّالون - حلب (OP1141-2)',
		'Cabin Cleaner': 'عامل تنظيف مقصورة',
		'Cleaners (OP1112-1)': 'عمال تنظيف (OP1112-1)',
		'AIR-Line Security': 'أمن شركة الطيران',
		'Drivers (HR1110-3)': 'سائقون (HR1110-3)',
		'BMA Agent (OP1131-1)': 'موظف BMA (OP1131-1)',
		'Flight Operations Agent (CM1001-1)': 'موظف عمليات الطيران (CM1001-1)',
		'HR Coordinator (HR1111-0)': 'منسق موارد بشرية (HR1111-0)',
		'Check-In Supervisor (OP1121-0)': 'مشرف تسجيل الوصول (OP1121-0)',
		'Receptionist (HR1110-1)': 'موظف استقبال (HR1110-1)',
		'Lost & Found Supervisor (OP1131-0)': 'مشرف المفقودات (OP1131-0)',
		'Buffet/Cafeteria Attendants (HR1110-5)': 'عاملو البوفيه والكافتيريا (HR1110-5)',
		'Passenger Services Manager (OP1120-0)': 'مدير خدمات المسافرين (OP1120-0)',
		'Learning & Development Manager (HR1130-0)': 'مدير التعلم والتطوير (HR1130-0)',
		'Station Director - Damascus (OP1100-0)': 'مدير المحطة - دمشق (OP1100-0)',
		'Public Relations Officer - PRO (HR1112-0)': 'مسؤول العلاقات العامة - PRO (HR1112-0)',
		'Pricing Agent (CM1001-2)': 'موظف تسعير (CM1001-2)',
		'Quality Assurance Manager (QT1010-0)': 'مدير ضمان الجودة (QT1010-0)',
		'Lost & Found Supervisor - Aleppo (OP1142-0)': 'مشرف المفقودات - حلب (OP1142-0)',
		'Cabin Appearance Supervisor (OP1112-0)': 'مشرف مظهر المقصورة (OP1112-0)'
	})
};
