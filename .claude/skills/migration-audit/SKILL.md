---
name: migration-audit
description: Read-only audit of the hand-applied Postgres/Supabase SQL migrations in backend/database/migrations/ (market_prices schema changes, RLS/grant security fixes, rollback and recovery scripts). Use this whenever the user asks to review, audit, check, sanity-check or "look over" a migration, rollback, recovery or *_checks.sql script, asks whether a migration is safe to run in the Supabase SQL Editor, or wants to compare a migration against schema.sql or the backend code. That holds even when they don't say "audit".
---

# Migration audit (read-only)

AgriVoice has no migration tool. A human pastes each script into the Supabase SQL Editor, so the review is the only gate before a script touches live data. The audit has to be reproducible: someone must be able to tell which bytes were reviewed and re-check every claim.

## Ground rules

- **Read-only.** Don't connect to any database, don't run `psql` or `supabase` CLI commands, and don't edit the migration files. Report findings; the user decides and applies. If something can only be confirmed against the live DB, write the read-only query that would confirm it and label it as unverified.
- `backend/database/migrations/` may be untracked in git, so `git diff` can miss it. Always read the files directly.
- Cite every finding as `file:line`, using the numbered dump from step 2.

## Procedure

1. **Pin the inputs.** Run `sha256sum` on every file under review and on `../schema.sql` and `../inspect_market_prices.sql`. Put the hashes at the top of the report so the findings are tied to exact file contents. Also record `git rev-parse --abbrev-ref HEAD` and `git status --short -- backend/database`.

2. **Numbered dump.** Read each file with line numbers (`cat -n`). Read the paired files together: the migration, its rollback, its recovery script, its `*_checks.sql` and any `*.md` plan.

3. **Check inventory.** List every guard the script enforces: each `RAISE EXCEPTION` with its condition, plus every pre-check and post-check. For each one, say what failure it catches and whether it fires *before* the first data-modifying statement. Then list what the header comments promise that no check verifies. Those gaps are usually the most important findings.

4. **Transaction scan.**
   - Find the top-level `BEGIN;` and `COMMIT;`. A `BEGIN` inside a `DO $$ … $$` block opens a plpgsql block, not a transaction, so don't count it. Confirm that every data-modifying statement sits between the top-level pair, and nothing runs after `COMMIT` except read-only verification.
   - Flag statements that can't run inside a transaction block (`CREATE INDEX CONCURRENTLY`, `VACUUM`, `ALTER TYPE … ADD VALUE` before PG 12, `ALTER SYSTEM`).
   - Flag `ON COMMIT DROP` temp tables that a later section reads after the commit.
   - The SQL Editor runs the whole paste as one batch. Check that a failure halfway through can't leave a partial state.

5. **Rollback and recovery scan.** For every change the migration makes (columns, constraints, indexes, policies, grants, backup tables, metadata tables), find the statement that undoes it, or note that none exists. Check that the rollback refuses to run when the migration never committed, and when rows were written after the migration. Check that checksums are compared over the same columns and the same ordering in both directions.

6. **Postgres version caveats.** Note the version the scripts assume. Supabase is currently on PG 15 or later, and the 002 preflight prints `server_version`. Flag any syntax or behaviour that depends on the version, for example `NULLS NOT DISTINCT` (PG 15+), `MERGE` (PG 15+), `GRANT … ON SCHEMA` / `pg_read_all_data` defaults, the `public` schema CREATE privilege (revoked by default in PG 15+), and `security_invoker` views (PG 15+).

7. **Supabase specifics.** Consider the `anon`, `authenticated` and `service_role` roles. RLS policies `TO public` apply to every role. Grants made by the owner and grants made by other grantors are separate privileges. Default privileges apply to future tables. `service_role` bypasses RLS. The backend upserts with the service_role key, so a fix that blocks anon writes must not block those upserts. For the general rules, read `../supabase-postgres-best-practices/references/security-privileges.md` and `security-rls-basics.md` (and `lock-short-transactions.md` for anything that takes locks on a live table).

8. **Code and schema consistency.** Compare the columns, the unique key and the NOT NULL columns against `backend/database/schema.sql`, and against `backend/app/services/price_sync.py` (`CONFLICT_COLUMNS`, `LEGACY_PRICE_COLUMN`) and `market_service.py` / `chat_service.py`. If the migration and the code disagree, the deploy order matters, so say which order is safe.

9. **Test search.** Use `grep -rn` over `backend/tests/` to find which tests exercise the touched columns and behaviour. Remember that the tests use `FakeSupabase`, so they never execute SQL; say so, and name the behaviours that only the SQL checks cover.

## Report format

```
# Migration audit — <files>

## Inputs
<sha256 table, branch, git status>

## Verdict
Safe to run as-is / Safe after fixes / Do not run — one paragraph why.

## Findings
| # | Severity (blocker/high/medium/low/nit) | file:line | Finding | Suggested fix |

## Check inventory
<guards table; then "Promised but not verified">

## Transaction & rollback
<results of steps 4–5>

## Version / Supabase caveats

## Code & test coverage

## Queries to run before applying (read-only, unverified)
```

Keep findings concrete: name the input or DB state that breaks the script and what happens. Leave out style nits unless they could cause a mistake when a human pastes the script into the SQL Editor.
