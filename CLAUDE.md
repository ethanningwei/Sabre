@AGENTS.md

# Sabre — notes for Claude

- Read README.md first. Plan and decisions: docs/PLAN.md.
- **Parity is sacred.** Any change in `lib/parade/render.ts` or `compute.ts` must keep `npm test` green. The golden text is real bot output, and trailing spaces in `tests/fixtures/example-300926.txt` matter.
- Every server action calls `actionViewer()` or `actionAdmin()`, plus the relevant `assertCanEdit*` scope check, before touching data. Mutations write to `audit_log` via `audit()`.
- Dates are `YYYY-MM-DD` strings and times are `HHMM` strings, both in SGT (a fixed +08:00). Use the helpers in `lib/parade/time.ts`.
- `lib/data/snapshot.ts`, `write-coy.ts` and `parse-export.ts` must stay importable from plain Node (the scripts use them): no `server-only`, no Next APIs.
- UI components are shadcn on **Base UI** (the `render` prop, not `asChild`). Check `components/ui/*` before use.
- Mobile first: large tap targets, bottom sheets for editing, bottom nav.
- Never commit `credentials.json`, `.env*` (except `.env.example`) or `*-export.json`.
