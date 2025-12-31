import fs from 'node:fs';
import { Client } from 'pg';

const localSettings = JSON.parse(fs.readFileSync(new URL('../local.settings.json', import.meta.url), 'utf8'));
const url = localSettings?.Values?.DATABASE_URL;

if (typeof url !== 'string' || url.trim().length === 0) {
  console.error('Missing Values.DATABASE_URL in local.settings.json');
  process.exit(1);
}

const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

const query = `
  select
    column_name,
    data_type,
    column_default,
    is_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'entry_media'
  order by ordinal_position;
`;

try {
  await client.connect();
  const res = await client.query(query);
  console.log(JSON.stringify(res.rows, null, 2));
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
