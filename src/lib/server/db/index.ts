import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';
import { makeBatch } from './batch.js';
import { DATABASE_URL } from '$app/env/private';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = postgres(DATABASE_URL, { max: 10 });

export const db = drizzle(client, { schema });

/** Run several writes atomically (one transaction), in order. */
export const batch = makeBatch(db);
