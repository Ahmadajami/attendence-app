/** Client-safe shapes returned by the staff service. */

export type StaffFunctionOption = {
	id: string;
	key: string;
	nameEn: string;
	nameAr: string;
};

export type TeamOption = {
	id: string;
	nameEn: string;
	nameAr: string;
	active: boolean;
};

export type DepartmentOption = {
	id: string;
	nameEn: string;
	nameAr: string;
	active: boolean;
};

export type JobTitleOption = {
	id: string;
	nameEn: string;
	nameAr: string;
	active: boolean;
};

export type StaffRow = {
	id: string;
	employeeNo: string;
	fullName: string;
	fullNameAr: string | null;
	firstNameEn: string | null;
	lastNameEn: string | null;
	firstNameAr: string | null;
	lastNameAr: string | null;
	phone: string | null;
	workEmail: string | null;
	startDate: string | null;
	active: boolean;
	function: StaffFunctionOption | null;
	department: DepartmentOption | null;
	team: TeamOption | null;
	jobTitle: JobTitleOption | null;
};
