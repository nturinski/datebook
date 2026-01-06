import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim()) return process.env.DATABASE_URL;

  // Mirror drizzle.config.ts convenience behavior.
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.join(process.cwd(), 'local.settings.json'),
    path.join(process.cwd(), 'apps', 'functions', 'local.settings.json'),
    path.resolve(scriptDir, '..', 'local.settings.json'),
  ];

  try {
    const localSettingsPath = candidatePaths.find((p) => fs.existsSync(p));
    if (!localSettingsPath) throw new Error('local.settings.json not found');

    const raw = fs.readFileSync(localSettingsPath, 'utf8');
    const json = JSON.parse(raw);
    const v = json?.Values?.DATABASE_URL;
    if (typeof v === 'string' && v.trim()) return v;
  } catch {
    // ignore
  }

  throw new Error('DATABASE_URL is not set (env or apps/functions/local.settings.json)');
}

function redactDbUrl(urlString) {
  if (!/^postgres(ql)?:\/\//i.test(urlString)) return '<non-url connection string>'; // pg supports others

  const u = new URL(urlString);
  const user = u.username || '<unknown-user>';
  const host = u.hostname || '<unknown-host>';
  const port = u.port || '<default-port>';
  const db = u.pathname?.replace(/^\//, '') || '<unknown-db>';

  return `${user}@${host}:${port}/${db}`;
}

async function main() {
  const databaseUrl = loadDatabaseUrl();
  console.log('Inspecting DB:', redactDbUrl(databaseUrl));

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.toLowerCase().includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    max: 1,
  });

  try {
    const searchPath = await pool.query('show search_path;');
    console.log('search_path:', searchPath.rows?.[0]?.search_path);

    const tables = await pool.query(
      `
      select table_schema
      from information_schema.tables
      where table_name = 'scrapbook_pages'
      order by table_schema;
      `.trim()
    );

    if (tables.rowCount === 0) {
      console.log('No scrapbook_pages table found in any schema.');
      return;
    }

    console.log('Found scrapbook_pages in schemas:', tables.rows.map((r) => r.table_schema).join(', '));

    for (const { table_schema } of tables.rows) {
      const cols = await pool.query(
        `
        select column_name
        from information_schema.columns
        where table_schema = $1 and table_name = 'scrapbook_pages'
        order by ordinal_position;
        `.trim(),
        [table_schema]
      );

      const colNames = cols.rows.map((r) => r.column_name);
      const hasDetails = ['details_date', 'details_place', 'details_place_id', 'details_mood_tags', 'details_review'].every((c) =>
        colNames.includes(c)
      );

      console.log(`\nSchema: ${table_schema}`);
      console.log(`columns: ${colNames.join(', ')}`);
      console.log(`details columns present: ${hasDetails}`);
    }

    const mig = await pool.query(
      `
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
      ) as has_drizzle_migrations;
      `.trim()
    );

    if (mig.rows?.[0]?.has_drizzle_migrations) {
      const last = await pool.query(
        `
        select id, hash, created_at
        from drizzle.__drizzle_migrations
        order by created_at desc
        limit 10;
        `.trim()
      );
      console.log('\nLast drizzle migrations (drizzle.__drizzle_migrations):');
      for (const row of last.rows) {
        console.log(`- id=${row.id} created_at=${row.created_at} hash=${row.hash}`);
      }
    } else {
      console.log('\nNo drizzle.__drizzle_migrations table found.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
