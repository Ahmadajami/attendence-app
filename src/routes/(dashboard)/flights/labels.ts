import { m } from '#lib/paraglide/messages.js';
import type { FlightDirection, FlightStatus } from '#lib/types/flights.js';

export function directionLabel(direction: FlightDirection): string {
	return direction === 'arrival' ? m.flights_direction_arrival() : m.flights_direction_departure();
}

export function statusLabel(status: FlightStatus): string {
	const labels: Record<FlightStatus, () => string> = {
		scheduled: m.flights_status_scheduled,
		delayed: m.flights_status_delayed,
		boarding: m.flights_status_boarding,
		departed: m.flights_status_departed,
		arrived: m.flights_status_arrived,
		cancelled: m.flights_status_cancelled,
		diverted: m.flights_status_diverted
	};
	return labels[status]();
}

export function statusVariant(
	status: FlightStatus
): 'default' | 'secondary' | 'destructive' | 'outline' {
	if (status === 'cancelled' || status === 'diverted') return 'destructive';
	if (status === 'delayed') return 'outline';
	if (status === 'boarding' || status === 'departed' || status === 'arrived') return 'secondary';
	return 'outline';
}

export function flightName(flight: { airlineCode: string; flightNo: string }): string {
	return `${flight.airlineCode} ${flight.flightNo}`;
}
