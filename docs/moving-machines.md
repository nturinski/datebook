# Moving this repo to another machine (what to copy)

The safest approach is:

1. **Commit all real work to Git** (source, migrations, config templates).
2. **Do not commit secrets** (`.env`, `local.settings.json`, keys).
3. On the new machine: **clone + install + recreate secrets from templates**.

## 1) What to transfer

### Always (project source)
If your branch is pushed to a remote, you don't need to “copy files” — you just clone:

- `git clone …`
- `pnpm install`

### Local-only files (usually secrets)
These are typically *ignored by git* and must be recreated (or securely transferred):

- `apps/functions/local.settings.json`
- `apps/functions/.env`
- `apps/mobile/.env`
- `local.settings.json` (repo root, if you use it)
- `.env` (repo root, if you use it)

## 2) How to *discover* what you're relying on locally

### A) Show ignored files that exist on disk
This lists files that are **present locally but not tracked** because they match `.gitignore`:

- `git ls-files -o -i --exclude-standard`

That is the best "what do I need to recreate" command.

### B) Show everything not committed yet
- `git status`

If you see migrations in `apps/functions/drizzle/` as untracked, commit them.

## 3) Templates (committed) vs secrets (local)

This repo includes templates you can copy on a new machine:

- `apps/functions/local.settings.example.json`
- `apps/functions/.env.example`
- `apps/mobile/.env.example`
- `local.settings.example.json`
- `.env.example`

On a new machine:

- Copy `*.example.*` → the real filename (remove `.example`)
- Fill in values

## 4) New machine checklist

1. Clone the repo
2. Install dependencies
   - `pnpm install`
3. Create local env files
   - `apps/functions/local.settings.json` (copy from example)
   - `apps/functions/.env` (copy from example)
   - `apps/mobile/.env` (copy from example)
4. Apply DB migrations
   - `pnpm --filter @datebook/functions db:migrate`
5. Start dev servers
   - Functions: `pnpm --filter @datebook/functions dev`
   - Mobile: `pnpm --filter @datebook/mobile dev`

## 5) Security note
If you ever pasted real keys into chat/logs, consider rotating them.
