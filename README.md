# datebook

A relationship-scoped “memories” app:

- Backend: Azure Functions (TypeScript) + Postgres (Drizzle)
- Mobile/Web: Expo Router

## Local development

### 1) Install

- `pnpm install`

### 2) Create local settings (secrets)

**Do not commit secrets**. Copy templates and fill in your values:

- `apps/functions/local.settings.example.json` → `apps/functions/local.settings.json`
- `apps/functions/.env.example` → `apps/functions/.env`
- `apps/mobile/.env.example` → `apps/mobile/.env`

(If you use root-level settings: `local.settings.example.json` → `local.settings.json`, `.env.example` → `.env`.)

### 3) Run migrations

- `pnpm --filter @datebook/functions db:migrate`

### 4) Run dev

- Functions: `pnpm --filter @datebook/functions dev`
- Mobile: `pnpm --filter @datebook/mobile dev`

## Moving to another machine

See `docs/moving-machines.md` for the best way to identify which local-only files you need to recreate.
