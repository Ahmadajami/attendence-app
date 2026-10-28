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

export type StaffRow = {
	id: string;
	employeeNo: string;
	fullName: string;
	fullNameAr: string | null;
	phone: string | null;
	active: boolean;
	function: StaffFunctionOption;
	team: TeamOption | null;
};
