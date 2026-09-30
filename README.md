# Sabre

Web app for Sabre coy (8SIR) company processes. The MVP replaces the parade-state Telegram bot (`legacy/paradestate.py`) and its Google Sheets.

- Guardcomms (GCs) update attendance, shifts and Extra/RF/SOL for their platoon on their phones.
- Admins manage people, structure and users, and generate the parade state.
- Before generating, the app checks everything. If anything is wrong, it lists every problem and produces nothing, just like the bot did.
- A clean state can be copied, or sent to the coy's Telegram chat/topic with the old bot's token.

## Stack
Next.js 16 (App Router) · TypeScript · Tailwind + shadcn/ui (Base UI) · Postgres + Drizzle · Better Auth (Google sign-in) · Vitest.

## Layout
| Path | What |
|---|---|
| `lib/parade/` | **The engine.** A pure TypeScript port of the bot's counting, formatting, validation and message splitting. No DB or I/O. |
| `lib/db/schema.ts` | Tables: coy › subunit › camp › person, absence (open = absent, closed = history), duty (Extra/RF/SOL), parade_state (history), audit_log, and auth tables. |
| `lib/actions/` | Server actions. Every one checks the user's role and platoon scope first. |
| `lib/data/` | Snapshot loading, plus the Sheets import (`parse-export.ts`, `write-coy.ts`). |
| `app/(app)/` | Screens: Overview, Platoon `/s/[id]`, Camp `/c/[id]`, Duties, Parade, History, Admin. |
| `scripts/` | `export_from_sheets.py` and `import-sabre.ts` (the one-time migration), plus `seed-example.ts`. |
| `tests/` | Golden tests against the bot's real output, validation, import and DB round-trip tests. |

## Output parity
The parade-state text matches the bot **character for character**. `tests/fixtures/example-300926.txt` is a real bot output, and the tests render it from the engine, from the database, and from a simulated Sheets import.

Some bot quirks are kept on purpose and marked `PARITY QUIRK` in `lib/parade/compute.ts`. For example, Extra/RF/SOL attached to an off-shift camp still count towards the platoon's present strength.

## Local development
```bash
npm install
createdb sabre_dev && createdb sabre_test
cp .env.example .env.local        # fill in DATABASE_URL, BETTER_AUTH_SECRET (openssl rand -base64 32), ADMIN_EMAILS
npm run db:migrate && npm run db:migrate:test
npm run seed                      # example Sabre data (placeholder names), or `npm run import`, see below
npm run dev
```
Setting `DEV_AUTH=1` in `.env.local` shows an email-only "dev sign-in" on the login page, so you can test without Google. It is never enabled in production.

To try the guardcomm view:
1. Sign in with an address that isn't in `ADMIN_EMAILS`.
2. Sign in as an admin, go to Admin › Users, and approve that user as a guardcomm for one platoon.

```bash
npm test          # all tests (DB tests use sabre_test)
npm run typecheck
npm run lint
```

## Importing the real data from Google Sheets
You can re-run this as many times as you like until cutover. Users, platoon assignments and history are kept. People, absences and duties are replaced.

1. Put the bot's `credentials.json` in the repo root. It is gitignored and should be treated like a password.
2. `pip3 install --upgrade gspread pandas python-telegram-bot python-dotenv google-auth`
3. `python3 scripts/export_from_sheets.py` uses the bot's own code to read and validate the Sheets.
   - If the bot would report problems, you get the same numbered list. Fix them in the Sheets and run it again.
   - Otherwise it writes `sabre-export.json`. This file contains personal data: don't commit or share it, and delete it after importing.
4. `npm run import` loads the data, then renders the parade state from the database at the bot's CAA and compares it with the bot's output.
   - `✅ PARITY` means the app prints exactly what the bot printed.
   - Any cell the app can't represent is listed, for example a date written `28/09/26` instead of `280926`.

For production, point `DATABASE_URL` at the production database when running step 4.

## Deploying (Vercel + Neon)
Environment variables to set in Vercel:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (Singapore region). Added automatically by the Marketplace integration. |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | The production URL, e.g. `https://sabre.vercel.app` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client (see below) |
| `ADMIN_EMAILS` | Comma-separated Google emails of the admins. They become admins on first sign-in. |
| `TELEGRAM_BOT_TOKEN` | The old bot's token (the `TOKEN=` line in `.env` on the VM) |

Run migrations against production with `DATABASE_URL=<prod url> npm run db:migrate`.

**Google OAuth client:** Google Cloud console › APIs & Services › Credentials › Create credentials › OAuth client ID › Web application.
- Authorised JavaScript origin: your app URL.
- Authorised redirect URI: `<app URL>/api/auth/callback/google`. Add `http://localhost:3000/api/auth/callback/google` too for local use.
- On the OAuth consent screen, publish the app (External). Otherwise only listed test users can sign in.

## Cutover from the bot
1. On the morning of cutover, export and import (see above) and confirm `✅ PARITY`.
2. In Admin › Coy settings, check the chat ID and thread ID, then press **Send test message**.
3. Brief the GCs: sign in with Google, then an admin approves them and assigns their platoon.
4. Stop the bot on the VM: `pkill -f paradestate.py`.
5. Delete the VM, or release its static IP. A *stopped* VM keeps charging for the IP.

## Adding modules later
Report-sick, MC tracking, leave and transport claims can build on the same data:
- Closed `absence` rows are already a full MC/leave history per person.
- `audit_log` records who changed what.
