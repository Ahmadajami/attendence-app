export type FlightDirection = 'arrival' | 'departure';

export type FlightStatus =
	'scheduled' | 'delayed' | 'boarding' | 'departed' | 'arrived' | 'cancelled' | 'diverted';

export type FlightTeam = {
	id: string;
	nameEn: string;
	nameAr: string;
};

/** One row of the day board. Dates are real `Date` objects through SvelteKit devalue. */
export type FlightRow = {
	id: string;
	airlineCode: string;
	flightNo: string;
	direction: FlightDirection;
	origin: string | null;
	destination: string | null;
	scheduledAt: Date;
	estimatedAt: Date | null;
	actualAt: Date | null;
	status: FlightStatus;
	stand: string | null;
	gate: string | null;
	aircraftType: string | null;
	imageUrl: string | null;
	handlingStartsAt: Date;
	handlingEndsAt: Date;
	team: FlightTeam | null;
};
