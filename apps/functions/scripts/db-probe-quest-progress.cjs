/*
 * Quick local diagnostic for the Functions DB connection.
 *
 * Usage (from apps/functions):
 *   node scripts/db-probe-quest-progress.cjs
 *
 * Reads DATABASE_URL from apps/functions/local.settings.json.
 * Does NOT print the URL.
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
      'select',
      '  current_database() as db,',
      '  current_schema() as schema,',
      '  to_regclass($1) as quest_progress',
    ].join('\n'),
    ['public.quest_progress']
  );

  const row = rows[0] || {};
  console.log({
    db: row.db,
    schema: row.schema,
    quest_progress: row.quest_progress,
    exists: row.quest_progress === 'quest_progress' || row.quest_progress === 'public.quest_progress',
  });

  await client.end();
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exitCode = 1;
});
