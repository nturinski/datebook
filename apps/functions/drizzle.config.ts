import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

import * as fs from 'node:fs';
import * as path from 'node:path';

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0) {
    return process.env.DATABASE_URL;
  }

  // Convenience for local dev: use the same DATABASE_URL as the Functions host.
  // (Azure Functions reads apps/functions/local.settings.json, but drizzle-kit does not.)
  try {
    const localSettingsPath = path.join(__dirname, 'local.settings.json');
    const raw = fs.readFileSync(localSettingsPath, 'utf8');
    const json = JSON.parse(raw) as { Values?: Record<string, unknown> };
    const v = json?.Values?.DATABASE_URL;
    if (typeof v === 'string' && v.trim().length > 0) return v;
  } catch {
    // ignore
  }

  throw new Error(
    'DATABASE_URL is not set. Set it in your shell env, in an apps/functions/.env file, or in apps/functions/local.settings.json.'
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/**/*.ts',
  out: './drizzle',
  dbCredentials: {
    url: getDatabaseUrl(),
  },
  strict: true,
  verbose: true,
});
