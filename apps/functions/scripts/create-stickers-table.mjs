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

const statements = [
  `CREATE TABLE IF NOT EXISTS public.scrapbook_page_stickers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    relationship_id uuid NOT NULL,
    scrapbook_id uuid NOT NULL,
    page_id uuid NOT NULL,
    kind text NOT NULL,
    x double precision DEFAULT 0 NOT NULL,
    y double precision DEFAULT 0 NOT NULL,
    scale double precision DEFAULT 1 NOT NULL,
    rotation double precision DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
  );`,
  // Foreign keys (guarded)
  `DO $$
  BEGIN
    ALTER TABLE public.scrapbook_page_stickers
      ADD CONSTRAINT scrapbook_page_stickers_relationship_id_relationships_id_fk
      FOREIGN KEY (relationship_id) REFERENCES public.relationships(id)
      ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;`,
  `DO $$
  BEGIN
    ALTER TABLE public.scrapbook_page_stickers
      ADD CONSTRAINT scrapbook_page_stickers_scrapbook_id_scrapbooks_id_fk
      FOREIGN KEY (scrapbook_id) REFERENCES public.scrapbooks(id)
      ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;`,
  `DO $$
  BEGIN
    ALTER TABLE public.scrapbook_page_stickers
      ADD CONSTRAINT scrapbook_page_stickers_page_id_scrapbook_pages_id_fk
      FOREIGN KEY (page_id) REFERENCES public.scrapbook_pages(id)
      ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;`,
  // Indexes
  `CREATE INDEX IF NOT EXISTS scrapbook_page_stickers_page_id_created_at_idx
    ON public.scrapbook_page_stickers USING btree (page_id, created_at);`,
  `CREATE INDEX IF NOT EXISTS scrapbook_page_stickers_scrapbook_id_created_at_idx
    ON public.scrapbook_page_stickers USING btree (scrapbook_id, created_at);`,
  `CREATE INDEX IF NOT EXISTS scrapbook_page_stickers_relationship_id_created_at_idx
    ON public.scrapbook_page_stickers USING btree (relationship_id, created_at);`,
];

for (const sql of statements) {
  // eslint-disable-next-line no-console
  console.log('Executing:', sql.split('\n')[0].slice(0, 120) + (sql.includes('\n') ? ' …' : ''));
  await client.query(sql);
}

const check = await client.query(
  "select to_regclass('public.scrapbook_page_stickers') as table"
);
console.log('Result:', check.rows[0]);

await client.end();
