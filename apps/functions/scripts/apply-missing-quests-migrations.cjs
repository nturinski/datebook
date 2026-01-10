/*
 * Applies the quests-related SQL migrations directly.
 *
 * Why:
 * - drizzle-kit migrate only applies migrations referenced by drizzle/meta/_journal.json.
 * - If SQL files exist but the journal doesn't list them, they won't run.
 *
 * This script is intentionally narrow in scope: it only runs 0030–0032.
 *
 * Usage (from apps/functions):
 *   node scripts/apply-missing-quests-migrations.cjs
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

function readMigrationSql(filename) {
  const p = path.join(__dirname, '..', 'drizzle', filename);
  return fs.readFileSync(p, 'utf8');
}

async function main() {
  const url = getDatabaseUrlFromLocalSettings();

  const client = new Client({
    connectionString: url,
    ssl: sslFromConnectionString(url),
  });

  await client.connect();

  const files = ['0030_quests.sql', '0031_quest_progress_expired_at.sql', '0032_quest_progress_analytics.sql'];

  try {
    await client.query('begin');

    for (const f of files) {
      const sql = readMigrationSql(f);
      // node-postgres supports multiple SQL statements in a single query string.
      // These migrations are idempotent (IF NOT EXISTS / ON CONFLICT), so safe to re-run.
      // eslint-disable-next-line no-console
      console.log(`Applying ${f}...`);
      await client.query(sql);
    }

    await client.query('commit');
    // eslint-disable-next-line no-console
    console.log('Done.');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exitCode = 1;
});
