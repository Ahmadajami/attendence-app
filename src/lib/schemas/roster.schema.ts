import { z } from 'zod';

// Team supervisors. Patterns, assignments and own rules: `pattern.schema.ts`.

export const addSupervisorSchema = z.object({ staffId: z.uuid() });
export const removeSupervisorSchema = z.object({ supervisorId: z.uuid() });

/** Superforms status message of the roster forms. */
export type RosterMessage = { kind: 'success' | 'error'; text: string };
