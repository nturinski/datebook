import { drizzle } from 'drizzle-orm/node-postgres';

import { getPgPool } from '../lib/postgres';
import * as schema from './schema/schema';

/**
 * Shared Drizzle client for Azure Functions.
 *
 * Reuses the existing node-postgres Pool so we keep connection pooling behavior
 * consistent across the app.
 */
export const db = drizzle(getPgPool(), { schema });
