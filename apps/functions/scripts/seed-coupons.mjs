import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim()) return process.env.DATABASE_URL;

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.join(process.cwd(), 'local.settings.json'),
    path.join(process.cwd(), 'apps', 'functions', 'local.settings.json'),
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

async function ensureUser(pool, email) {
  const existing = await pool.query(
    'select id from "public"."users" where lower(email) = lower($1) limit 1;',
    [email]
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const created = await pool.query(
    'insert into "public"."users" (email, created_at) values ($1, now()) returning id;',
    [email]
  );
  return created.rows[0].id;
}

async function ensureRelationship(pool) {
  const existing = await pool.query('select id from "public"."relationships" limit 1;');
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const created = await pool.query(
    'insert into "public"."relationships" (id, created_at) values (gen_random_uuid(), now()) returning id;'
  );
  return created.rows[0].id;
}

async function ensureRelationshipMember(pool, relationshipId, userId, role) {
  await pool.query(
    `
    insert into "public"."relationship_members" (relationship_id, user_id, role, status, created_at)
    values ($1, $2, $3, 'active', now())
    on conflict (relationship_id, user_id) do nothing;
    `.trim(),
    [relationshipId, userId, role]
  );
}

async function main() {
  const databaseUrl = loadDatabaseUrl();
  console.log('Seeding coupons into:', redactDbUrl(databaseUrl));

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.toLowerCase().includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    max: 1,
  });

  try {
    await pool.query('begin;');

    // Ensure a minimal dev relationship + two users exist.
    const relationshipId = await ensureRelationship(pool);
    const issuerUserId = await ensureUser(pool, 'alice@example.com');
    const recipientUserId = await ensureUser(pool, 'bob@example.com');

    await ensureRelationshipMember(pool, relationshipId, issuerUserId, 'owner');
    await ensureRelationshipMember(pool, relationshipId, recipientUserId, 'member');

    const inserted = await pool.query(
      `
      insert into "public"."coupons" (
        relationship_id,
        issuer_user_id,
        recipient_user_id,
        title,
        description,
        template_id,
        expires_at,
        status,
        created_at,
        updated_at,
        redeemed_at
      ) values (
        $1, $2, $3,
        $4, $5, $6,
        now() + interval '14 days',
        'ACTIVE',
        now(),
        now(),
        null
      )
      returning id, relationship_id, issuer_user_id, recipient_user_id, status;
      `.trim(),
      [
        relationshipId,
        issuerUserId,
        recipientUserId,
        'A Date Night Coupon',
        'Redeem for one planned date night (movie optional).',
        'pastel_01',
      ]
    );

    await pool.query('commit;');

    const row = inserted.rows[0];
    console.log('Inserted coupon:', {
      id: row.id,
      relationshipId: row.relationship_id,
      issuerUserId: row.issuer_user_id,
      recipientUserId: row.recipient_user_id,
      status: row.status,
    });
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
