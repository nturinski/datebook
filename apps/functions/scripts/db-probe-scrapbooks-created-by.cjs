/*
 * Verifies whether the scrapbooks table still has legacy created_by,
 * and whether created_by_user_id is non-nullable.
 *
 * Usage (from apps/functions):
 *   node scripts/db-probe-scrapbooks-created-by.cjs
 */

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

function getDatabaseUrlFromLocalSettings() {
  const localSettingsPath = path.join(__dirname, '..', 'local.settings.json');
  const raw = fs.readFileSync(localSettingsPath, 'utf8');
  const json = JSON.parse(raw);
  const url = json?.Values?.DATABASE_URL;
  if (typeof url !== 'string' || url.trim().length === 0) {
    throw new Error('DATABASE_URL missing in apps/functions/local.settings.json');
  }
  return url;
}

function sslFromConnectionString(connectionString) {
  const lowered = String(connectionString).toLowerCase();
  if (
    lowered.includes('sslmode=require') ||
    lowered.includes('sslmode=verify-ca') ||
    lowered.includes('sslmode=verify-full')
  ) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

async function main() {
  const url = getDatabaseUrlFromLocalSettings();

  const client = new Client({
    connectionString: url,
    ssl: sslFromConnectionString(url),
  });

  await client.connect();

  const { rows } = await client.query(
    [
      'select column_name, is_nullable',
      'from information_schema.columns',
      "where table_schema = 'public'",
      "  and table_name = 'scrapbooks'",
      "  and column_name in ('created_by', 'created_by_user_id')",
      'order by column_name',
    ].join('\n')
  );

  console.log(rows);

  await client.end();
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exitCode = 1;
});
