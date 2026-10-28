import { requireActorPermission, type Actor } from '../common.js';
import { listShiftRows, type ShiftRow } from './shifts.crud.js';

/** Every shift (inactive too, so saved patterns resolve). For other services' reads. */
export async function loadShifts(): Promise<ShiftRow[]> {
	return listShiftRows();
}

/** Every shift, by code. */
export async function listShifts(actor: Actor): Promise<ShiftRow[]> {
	requireActorPermission(actor, 'staff.write');
	return listShiftRows();
}
