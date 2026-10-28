import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { auditInsert } from '#lib/server/audit.js';
import { m } from '#lib/paraglide/messages.js';
import { db } from '#lib/server/db/index.js';
import {
	ConflictError,
	ForbiddenError,
	InvalidInputError,
	NotFoundError
} from '#lib/server/errors.js';
import { flight, teamFlightAssignment } from '#lib/server/db/schema/index.js';
import { isHandlingOverride } from '#lib/flights/handling.js';
import { damascusDayRange } from '#lib/server/time.js';
import type { FlightDirection, FlightRow, FlightStatus } from '#lib/types/flights.js';
import { pgErrorCode, type Actor } from './common.js';

export type FlightInput = {
	airlineCode: string;
	flightNo: string;
	direction: FlightDirection;
	origin: string | null;
	destination: string | null;
	scheduledAt: Date;
	status: FlightStatus;
	aircraftType: string | null;
	stand: string | null;
	gate: string | null;
	imageUrl: string | null;
	handlingStartsAt: Date;
	handlingEndsAt: Date;
	/** Why the window differs from the default; required only for an override (CLAUDE.md §6.3). */
	overrideReason: string | null;
};

const DIRECTIONS: FlightDirection[] = ['arrival', 'departure'];
const STATUSES: FlightStatus[] = [
	'scheduled',
	'delayed',
	'boarding',
	'departed',
	'arrived',
	'cancelled',
	'diverted'
];

function requireFlightRead(actor: Actor) {
	if (!actor.permissions.has('flight.read')) throw new ForbiddenError();
}

function requireFlightWrite(actor: Actor) {
	if (!actor.permissions.has('flight.write')) throw new ForbiddenError();
}

function clean(value: string | null): string | null {
	const text = value?.trim() ?? '';
	return text || null;
}

function validate(input: FlightInput) {
	if (!input.airlineCode.trim() || !input.flightNo.trim()) {
		throw new InvalidInputError('invalid_input', m.flights_error_invalid());
	}
	if (!DIRECTIONS.includes(input.direction) || !STATUSES.includes(input.status)) {
		throw new InvalidInputError('invalid_input', m.flights_error_invalid());
	}
	if (
		Number.isNaN(input.scheduledAt.getTime()) ||
		Number.isNaN(input.handlingStartsAt.getTime()) ||
		Number.isNaN(input.handlingEndsAt.getTime())
	) {
		throw new InvalidInputError('invalid_input', m.flights_error_invalid());
	}
	if (input.handlingEndsAt.getTime() <= input.handlingStartsAt.getTime()) {
		throw new InvalidInputError('invalid_window', m.flights_window_invalid(), {
			field: 'handlingEndsAt'
		});
	}
	if (input.imageUrl) {
		try {
			if (new URL(input.imageUrl).protocol !== 'https:') {
				throw new InvalidInputError('invalid_image_url', m.flights_image_invalid(), {
					field: 'imageUrl'
				});
			}
		} catch {
			throw new InvalidInputError('invalid_image_url', m.flights_image_invalid(), {
				field: 'imageUrl'
			});
		}
	}
}

function values(input: FlightInput) {
	return {
		airlineCode: input.airlineCode.trim().toUpperCase(),
		flightNo: input.flightNo.trim().toUpperCase(),
		direction: input.direction,
		origin: clean(input.origin)?.toUpperCase() ?? null,
		destination: clean(input.destination)?.toUpperCase() ?? null,
		scheduledAt: input.scheduledAt,
		status: input.status,
		aircraftType: clean(input.aircraftType),
		stand: clean(input.stand),
		gate: clean(input.gate),
		imageUrl: clean(input.imageUrl),
		handlingStartsAt: input.handlingStartsAt,
		handlingEndsAt: input.handlingEndsAt
	};
}

/**
 * The audit `reason` for a save: the given reason when the window is a manual override (then it is
 * required), otherwise `null`. `stored` is the flight before an update.
 */
function overrideReason(
	data: ReturnType<typeof values>,
	reason: string | null,
	stored?: { scheduledAt: Date; handlingStartsAt: Date; handlingEndsAt: Date }
): string | null {
	const override = isHandlingOverride(
		{
			scheduledAt: data.scheduledAt,
			direction: data.direction,
			startsAt: data.handlingStartsAt,
			endsAt: data.handlingEndsAt
		},
		stored && {
			scheduledAt: stored.scheduledAt,
			startsAt: stored.handlingStartsAt,
			endsAt: stored.handlingEndsAt
		}
	);
	if (!override) return null;
	const text = reason?.trim();
	if (!text) {
		throw new InvalidInputError('override_reason_required', m.flights_override_reason_required(), {
			field: 'overrideReason'
		});
	}
	return text;
}

async function findFlight(id: string) {
	const row = await db.query.flight.findFirst({
		where: eq(flight.id, id),
		with: {
			assignments: {
				where: eq(teamFlightAssignment.status, 'assigned'),
				columns: { id: true, teamId: true, startsAt: true, endsAt: true }
			}
		}
	});
	if (!row) throw new NotFoundError(m.flights_error_not_found());
	return row;
}

/** Flights whose scheduled time falls on one Damascus day (today by default). */
export async function listFlightsByDay(actor: Actor, day?: string | null) {
	requireFlightRead(actor);
	const range = damascusDayRange(day);
	const rows = await db.query.flight.findMany({
		where: and(gte(flight.scheduledAt, range.start), lt(flight.scheduledAt, range.end)),
		with: {
			assignments: {
				where: eq(teamFlightAssignment.status, 'assigned'),
				columns: { id: true },
				with: {
					team: { columns: { id: true, nameEn: true, nameAr: true } }
				}
			}
		},
		orderBy: [asc(flight.scheduledAt), asc(flight.flightNo)]
	});

	return {
		day: range.day,
		flights: rows.map((row): FlightRow => {
			const { assignments, ...rest } = row;
			return { ...rest, team: assignments[0]?.team ?? null };
		})
	};
}

export async function createFlight(actor: Actor, input: FlightInput) {
	requireFlightWrite(actor);
	validate(input);
	const id = randomUUID();
	const data = values(input);
	const reason = overrideReason(data, input.overrideReason);

	await db.batch([
		db.insert(flight).values({ id, ...data, source: 'manual' }),
		auditInsert({
			actor: actor.user,
			action: 'flight.create',
			entityType: 'flight',
			entityId: id,
			after: data,
			reason
		})
	]);

	return findFlight(id);
}

export async function updateFlight(actor: Actor, id: string, input: FlightInput) {
	requireFlightWrite(actor);
	const before = await findFlight(id);
	validate(input);
	const data = values(input);
	const reason = overrideReason(data, input.overrideReason, before);
	const assignment = before.assignments[0];
	const cancelAssignment = data.status === 'cancelled' && assignment;
	const moveAssignment =
		assignment &&
		!cancelAssignment &&
		(assignment.startsAt.getTime() !== data.handlingStartsAt.getTime() ||
			assignment.endsAt.getTime() !== data.handlingEndsAt.getTime());

	try {
		await db.batch([
			db.update(flight).set(data).where(eq(flight.id, id)),
			...(cancelAssignment
				? [
						db
							.update(teamFlightAssignment)
							.set({ status: 'cancelled' })
							.where(eq(teamFlightAssignment.id, assignment.id))
					]
				: moveAssignment
					? [
							db
								.update(teamFlightAssignment)
								.set({
									startsAt: data.handlingStartsAt,
									endsAt: data.handlingEndsAt
								})
								.where(eq(teamFlightAssignment.id, assignment.id))
						]
					: []),
			auditInsert({
				actor: actor.user,
				action: 'flight.update',
				entityType: 'flight',
				entityId: id,
				before: {
					airlineCode: before.airlineCode,
					flightNo: before.flightNo,
					direction: before.direction,
					origin: before.origin,
					destination: before.destination,
					scheduledAt: before.scheduledAt,
					status: before.status,
					aircraftType: before.aircraftType,
					stand: before.stand,
					gate: before.gate,
					imageUrl: before.imageUrl,
					handlingStartsAt: before.handlingStartsAt,
					handlingEndsAt: before.handlingEndsAt
				},
				after: data,
				reason
			}),
			...(cancelAssignment || moveAssignment
				? [
						auditInsert({
							actor: actor.user,
							action: cancelAssignment
								? 'assignment.cancel_for_flight'
								: 'assignment.move_for_flight',
							entityType: 'team_flight_assignment',
							entityId: assignment.id,
							before: {
								startsAt: assignment.startsAt,
								endsAt: assignment.endsAt,
								status: 'assigned'
							},
							after: cancelAssignment
								? { status: 'cancelled' }
								: { startsAt: data.handlingStartsAt, endsAt: data.handlingEndsAt }
						})
					]
				: [])
		]);
	} catch (error) {
		if (pgErrorCode(error) === '23P01') {
			throw new ConflictError('conflict', m.flights_error_conflict(), { cause: error });
		}
		throw error;
	}

	return findFlight(id);
}

/** Cancel without deleting. Also cancels the active team assignment, if any. */
export async function cancelFlight(actor: Actor, id: string) {
	requireFlightWrite(actor);
	const before = await findFlight(id);
	if (before.status === 'cancelled') return before;
	const assignment = before.assignments[0];

	await db.batch([
		db.update(flight).set({ status: 'cancelled' }).where(eq(flight.id, id)),
		...(assignment
			? [
					db
						.update(teamFlightAssignment)
						.set({ status: 'cancelled' })
						.where(eq(teamFlightAssignment.id, assignment.id))
				]
			: []),
		auditInsert({
			actor: actor.user,
			action: 'flight.cancel',
			entityType: 'flight',
			entityId: id,
			before: { status: before.status },
			after: { status: 'cancelled' }
		}),
		...(assignment
			? [
					auditInsert({
						actor: actor.user,
						action: 'assignment.cancel_for_flight',
						entityType: 'team_flight_assignment',
						entityId: assignment.id,
						before: { status: 'assigned' },
						after: { status: 'cancelled' }
					})
				]
			: [])
	]);

	return findFlight(id);
}
