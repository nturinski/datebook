import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim()) return process.env.DATABASE_URL;

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    // If invoked from apps/functions (common with pnpm --filter), this is correct.
    path.join(process.cwd(), 'local.settings.json'),
    // If invoked from repo root, this is correct.
    path.join(process.cwd(), 'apps', 'functions', 'local.settings.json'),
    // Robust fallback: relative to this script (apps/functions/scripts).
    path.resolve(scriptDir, '..', 'local.settings.json'),
  ];

  const localSettingsPath = candidatePaths.find((p) => fs.existsSync(p));
  if (!localSettingsPath) {
    throw new Error('DATABASE_URL is not set (env) and no local.settings.json file could be found');
  }

  const raw = fs.readFileSync(localSettingsPath, 'utf8');
  const json = JSON.parse(raw);
  const v = json?.Values?.DATABASE_URL;
  if (typeof v === 'string' && v.trim()) return v;

  throw new Error('DATABASE_URL is not set (env or apps/functions/local.settings.json)');
}

function redactDbUrl(urlString) {
  if (!/^postgres(ql)?:\/\//i.test(urlString)) return '<non-url connection string>';
  const u = new URL(urlString);
  const user = u.username || '<unknown-user>';
  const host = u.hostname || '<unknown-host>';
  const port = u.port || '<default-port>';
  const db = u.pathname?.replace(/^\//, '') || '<unknown-db>';
  return `${user}@${host}:${port}/${db}`;
}

const SQL = `
alter table if exists "public"."scrapbook_pages"
  add column if not exists "details_date" date;

alter table if exists "public"."scrapbook_pages"
  add column if not exists "details_place" text;

alter table if exists "public"."scrapbook_pages"
  add column if not exists "details_place_id" text;

alter table if exists "public"."scrapbook_pages"
  add column if not exists "details_mood_tags" jsonb;

alter table if exists "public"."scrapbook_pages"
  add column if not exists "details_review" text;

alter table if exists "public"."scrapbooks"
  add column if not exists "details_date" date;

alter table if exists "public"."scrapbooks"
  add column if not exists "details_place" text;

alter table if exists "public"."scrapbooks"
  add column if not exists "details_place_id" text;

alter table if exists "public"."scrapbooks"
  add column if not exists "details_mood_tags" jsonb;

alter table if exists "public"."scrapbooks"
  add column if not exists "details_review" text;
`.trim();

async function main() {
  const databaseUrl = loadDatabaseUrl();
  console.log('Applying details columns to:', redactDbUrl(databaseUrl));

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.toLowerCase().includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    max: 1,
  });

  try {
    await pool.query('begin;');
    await pool.query(SQL);
    await pool.query('commit;');

    const cols = await pool.query(
      `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'scrapbook_pages'
        and column_name in ('details_date', 'details_place', 'details_place_id', 'details_mood_tags', 'details_review')
      order by column_name;
      `.trim()
    );

    console.log('Verified columns in public.scrapbook_pages:', cols.rows.map((r) => r.column_name).join(', ') || '<none>');

    const sbCols = await pool.query(
      `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'scrapbooks'
        and column_name in ('details_date', 'details_place', 'details_place_id', 'details_mood_tags', 'details_review')
      order by column_name;
      `.trim()
    );

    console.log('Verified columns in public.scrapbooks:', sbCols.rows.map((r) => r.column_name).join(', ') || '<none>');
  } catch (e) {
    try {
      await pool.query('rollback;');
    } catch {
      // ignore
    }
    throw e;
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
