import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readFunctionsDatabaseUrl() {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'local.settings.json'), 'utf8');
  const json = JSON.parse(raw);
  const url = json?.Values?.DATABASE_URL;
  if (!url) throw new Error('apps/functions/local.settings.json is missing Values.DATABASE_URL');
  return url;
}

const { Client } = pg;

const url = process.env.DATABASE_URL || readFunctionsDatabaseUrl();
const needsSsl = url.toLowerCase().includes('sslmode=require');

const client = new Client({
  connectionString: url,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

await client.connect();

const result = await client.query(
  "select current_database() as db, current_schema() as schema, to_regclass('public.scrapbook_page_stickers') as public_table, to_regclass('scrapbook_page_stickers') as visible_table"
);

console.log(result.rows[0]);

const foundTables = await client.query(
  "select table_schema, table_name from information_schema.tables where table_name in ('scrapbook_page_stickers','__drizzle_migrations') order by table_schema, table_name"
);
console.log('Found tables (any schema):');
console.log(foundTables.rows);

try {
  const mig = await client.query(
    "select id, hash, created_at from __drizzle_migrations order by id desc limit 10"
  );
  console.log('__drizzle_migrations (latest 10):');
  console.log(mig.rows);
} catch (e) {
  console.log('No __drizzle_migrations table (or cannot read it):', e?.message ?? String(e));
}

try {
  const mig2 = await client.query(
    'select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 20'
  );
  console.log('drizzle.__drizzle_migrations (latest 20):');
  console.log(mig2.rows);
} catch (e) {
  console.log('No drizzle.__drizzle_migrations table (or cannot read it):', e?.message ?? String(e));
}

await client.end();
