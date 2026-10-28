import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { defaultHandlingWindow, shiftHandlingWindow } from '#lib/flights/handling.js';
import { db } from '#lib/server/db/index.js';
import { flight, team, teamFlightAssignment } from '#lib/server/db/schema/index.js';
import { damascusDayOf, parseDamascusDateTime } from '#lib/server/time.js';
import type { FlightImportData, ImportIssue, ImportRowDraft } from '#lib/types/imports.js';
import { mapColumns, normalizeText, FLIGHT_COLUMNS, type FlightField } from './columns.js';
import type { RawTable } from './parse.js';

type Direction = 'arrival' | 'departure';

const DIRECTIONS = new Map<string, Direction>([
	['arrival', 'arrival'],
	['arr', 'arrival'],
	['a', 'arrival'],
	['arrivals', 'arrival'],
	['وصول', 'arrival'],
	['قادم', 'arrival'],
	['departure', 'departure'],
	['dep', 'departure'],
	['departures', 'departure'],
	['d', 'departure'],
	['dpt', 'departure'],
	['مغادرة', 'departure'],
	['اقلاع', 'departure']
]);

function get(row: { values: string[] }, columns: Map<FlightField, number>, field: FlightField) {
	const index = columns.get(field);
	return index === undefined ? '' : (row.values[index] ?? '').trim();
}

function httpsUrl(value: string): boolean {
	try {
		return new URL(value).protocol === 'https:';
	} catch {
		return false;
	}
}

const DATE_MARGIN = 24 * 60 * 60 * 1000;

export async function buildFlightRows(table: RawTable): Promise<ImportRowDraft[]> {
	const columns = mapColumns(table.headers, FLIGHT_COLUMNS);
	const teams = await db
		.select({ id: team.id, nameEn: team.nameEn, nameAr: team.nameAr, active: team.active })
		.from(team)
		.where(eq(team.active, true))
		.orderBy(asc(team.nameEn));

	const teamByName = new Map<string, { id: string }>();
	for (const row of teams) {
		for (const value of [row.nameEn, row.nameAr]) {
			const key = normalizeText(value);
			if (key && !teamByName.has(key)) teamByName.set(key, row);
		}
	}

	type Pre = {
		rowNo: number;
		raw: Record<string, string>;
		issues: ImportIssue[];
		airlineCode: string;
		flightNo: string;
		direction: Direction | null;
		origin: string | null;
		destination: string | null;
		scheduledAt: Date | null;
		aircraftType: string | null;
		stand: string | null;
		gate: string | null;
		imageUrl: string | null;
		teamId: string | null;
		key: string | null;
	};

	const prelim: Pre[] = table.rows.map((row) => {
		const issues: ImportIssue[] = [];
		const airlineCode = get(row, columns, 'airline_code').toUpperCase();
		const flightNo = get(row, columns, 'flight_no').toUpperCase();
		const directionText = get(row, columns, 'direction');
		const scheduledText = get(row, columns, 'scheduled_at');
		const scheduledAt = scheduledText ? parseDamascusDateTime(scheduledText) : null;
		const imageUrl = get(row, columns, 'image_url') || null;
		const teamName = get(row, columns, 'team');

		if (!airlineCode) issues.push({ field: 'airline_code', code: 'required' });
		if (!flightNo) issues.push({ field: 'flight_no', code: 'required' });
		if (!directionText) issues.push({ field: 'direction', code: 'required' });
		if (!scheduledText) issues.push({ field: 'scheduled_at', code: 'required' });
		else if (!scheduledAt) {
			issues.push({ field: 'scheduled_at', code: 'invalid_datetime', value: scheduledText });
		}
		if (imageUrl && !httpsUrl(imageUrl)) {
			issues.push({ field: 'image_url', code: 'invalid_url', value: imageUrl });
		}

		const direction = directionText ? (DIRECTIONS.get(normalizeText(directionText)) ?? null) : null;
		if (directionText && !direction) {
			issues.push({ field: 'direction', code: 'invalid_direction', value: directionText });
		}

		let teamId: string | null = null;
		if (teamName) {
			const found = teamByName.get(normalizeText(teamName));
			if (!found) issues.push({ field: 'team', code: 'unknown_team', value: teamName });
			else teamId = found.id;
		}

		return {
			rowNo: row.rowNo,
			raw: row.raw,
			issues,
			airlineCode,
			flightNo,
			direction,
			origin: get(row, columns, 'origin').toUpperCase() || null,
			destination: get(row, columns, 'destination').toUpperCase() || null,
			scheduledAt,
			aircraftType: get(row, columns, 'aircraft_type') || null,
			stand: get(row, columns, 'stand') || null,
			gate: get(row, columns, 'gate') || null,
			imageUrl,
			teamId,
			key:
				airlineCode && flightNo && scheduledAt
					? `${airlineCode}|${flightNo}|${damascusDayOf(scheduledAt)}`
					: null
		};
	});

	const times = prelim
		.map((row) => row.scheduledAt)
		.filter((value): value is Date => value instanceof Date);
	const existingFlights =
		times.length > 0
			? await db
					.select()
					.from(flight)
					.where(
						and(
							gte(
								flight.scheduledAt,
								new Date(Math.min(...times.map((t) => t.getTime())) - DATE_MARGIN)
							),
							lte(
								flight.scheduledAt,
								new Date(Math.max(...times.map((t) => t.getTime())) + DATE_MARGIN)
							)
						)
					)
			: [];

	const existingByKey = new Map(
		existingFlights.map((row) => [
			`${row.airlineCode}|${row.flightNo}|${damascusDayOf(row.scheduledAt)}`,
			row
		])
	);
	const existingIds = existingFlights.map((row) => row.id);
	const assignments =
		existingIds.length > 0
			? await db
					.select({
						flightId: teamFlightAssignment.flightId,
						teamId: teamFlightAssignment.teamId,
						startsAt: teamFlightAssignment.startsAt,
						endsAt: teamFlightAssignment.endsAt
					})
					.from(teamFlightAssignment)
					.where(
						and(
							inArray(teamFlightAssignment.flightId, existingIds),
							eq(teamFlightAssignment.status, 'assigned')
						)
					)
			: [];
	const assignmentByFlight = new Map(assignments.map((row) => [row.flightId, row]));
	const seenKeys = new Set<string>();

	return prelim.map((row) => {
		const issues = [...row.issues];
		if (row.key) {
			if (seenKeys.has(row.key)) {
				issues.push({ field: 'flight_no', code: 'duplicate_in_file', value: row.key });
			} else {
				seenKeys.add(row.key);
			}
		}

		const existing = row.key ? existingByKey.get(row.key) : undefined;
		const assignment = existing ? assignmentByFlight.get(existing.id) : undefined;

		let parsed: FlightImportData | null = null;
		if (row.airlineCode && row.flightNo && row.direction && row.scheduledAt && row.key) {
			const handling = existing
				? shiftHandlingWindow(
						{
							scheduledAt: existing.scheduledAt,
							startsAt: existing.handlingStartsAt,
							endsAt: existing.handlingEndsAt
						},
						row.scheduledAt
					)
				: defaultHandlingWindow(row.scheduledAt, row.direction);

			parsed = {
				airlineCode: row.airlineCode,
				flightNo: row.flightNo,
				direction: row.direction,
				origin: row.origin,
				destination: row.destination,
				scheduledAt: row.scheduledAt.toISOString(),
				aircraftType: row.aircraftType,
				stand: row.stand,
				gate: row.gate,
				imageUrl: row.imageUrl,
				handlingStartsAt: handling.startsAt.toISOString(),
				handlingEndsAt: handling.endsAt.toISOString(),
				externalRef: row.key,
				source: 'import',
				teamId: row.teamId
			};
		}

		let action: 'create' | 'update' | 'skip' = 'skip';
		if (issues.length === 0 && parsed) {
			if (!existing) {
				action = 'create';
			} else {
				const desiredStart = new Date(parsed.handlingStartsAt).getTime();
				const desiredEnd = new Date(parsed.handlingEndsAt).getTime();
				const flightChanged =
					existing.airlineCode !== parsed.airlineCode ||
					existing.flightNo !== parsed.flightNo ||
					existing.direction !== parsed.direction ||
					(existing.origin ?? null) !== parsed.origin ||
					(existing.destination ?? null) !== parsed.destination ||
					existing.scheduledAt.getTime() !== new Date(parsed.scheduledAt).getTime() ||
					(existing.aircraftType ?? null) !== parsed.aircraftType ||
					(existing.stand ?? null) !== parsed.stand ||
					(existing.gate ?? null) !== parsed.gate ||
					(existing.imageUrl ?? null) !== parsed.imageUrl ||
					existing.handlingStartsAt.getTime() !== desiredStart ||
					existing.handlingEndsAt.getTime() !== desiredEnd;
				const teamChanged =
					parsed.teamId !== null &&
					(!assignment ||
						assignment.teamId !== parsed.teamId ||
						assignment.startsAt.getTime() !== desiredStart ||
						assignment.endsAt.getTime() !== desiredEnd);
				action = flightChanged || teamChanged ? 'update' : 'skip';
			}
		}

		return {
			rowNo: row.rowNo,
			raw: row.raw,
			parsed,
			errors: issues,
			action,
			targetId: existing?.id ?? null
		};
	});
}
