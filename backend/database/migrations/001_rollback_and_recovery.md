# Migration 001 — Rollout, Rollback and Recovery Plan

Applies to `public.market_prices` as inspected on 2026-10-27: 34 rows, integer `id`
(`market_prices_id_seq`, last_value 34), `fair_price_per_kg NOT NULL`,
`UNIQUE (crop_name, region)`, RLS enabled.

| File | Purpose | Modifies data? |
|---|---|---|
| `../inspect_market_prices.sql` | Read-only inspection, before and after | No |
| `001_market_prices_standardize.sql` | The migration | Yes, adds columns/index, swaps the unique constraint |
| `001_market_prices_standardize_rollback.sql` | Undo 001 (R1, optionally R2) | Yes |
| `001_recovery_restore_legacy_rows.sql` | Restore the 34 legacy rows from backup (R3) | Yes |

Every script runs in a single transaction and aborts on any failed check.
None of them touch the id sequence, RLS policies or grants.

---

## 1. Rollout order

The new backend code expects the migrated columns, and the old table rejects the
new sync. **Apply in this order:**

1. Record the pre-migration values: run `inspect_market_prices.sql` queries #2, #4, #5, #8, #9.
2. Make sure nothing else writes to `market_prices` during the migration.
   The old backend's sync cannot write anyway: it references an undefined setting.
3. Run `001_market_prices_standardize.sql` in the Supabase SQL Editor.
   Expected NOTICEs: `Dropped legacy constraint …` and `Migration 001 checks passed: 34 rows …`.
4. Re-run inspection #1–#5 and #11. Compare the checksums with step 1.
5. Deploy the new backend. Its first startup sync upserts about 663 verified rows.
6. Check: `SELECT is_legacy, count(*), min(price_date), max(price_date) FROM market_prices GROUP BY 1;`

If the new backend is deployed **before** step 3, the price endpoints return 502
and chat reports prices as `unavailable` until the migration is applied. Nothing is written.

## 2. Compatibility between the schema and the code

| Concern | How it's handled |
|---|---|
| `fair_price_per_kg NOT NULL` | Kept. The sync writes the same value to `price_per_kg` and `fair_price_per_kg`. |
| `UNIQUE (crop_name, region)` | Replaced by `UNIQUE (crop_name, region, price_date)` so monthly history fits. The sync upserts on `crop_name,region,price_date`. |
| `id` / sequence | The sync never sends `id`, so the existing `nextval` default assigns 35, 36, … Upsert conflicts consume sequence values, so gaps are expected and harmless. |
| `updated_at` | Legacy rows keep their original value. New rows record the sync time. |
| Legacy rows | `is_legacy = true`, `source = 'legacy sync (report date unknown)'`. The backend ranks verified rows first, keeps legacy rows out of history, returns `price_status = "unverified_legacy"`, and hides their placeholder date. |
| `schema.sql` (new projects) | Has the same columns, including `fair_price_per_kg`, `is_legacy` and `updated_at`. Do **not** run it on the existing project. |

## 3. Rollback and recovery decision tree

### R0 — The migration errored
Nothing changed: the transaction rolled back, and even the backup schema was not created.
Confirm with inspection #4. Fix the reported cause, then re-inspect before retrying.

### R1 — Applied, but no new rows yet (`SELECT count(*) FROM market_prices WHERE NOT is_legacy` = 0)
1. Stop or hold the new backend (`PRICE_SYNC_ON_STARTUP=false`).
2. Run `001_market_prices_standardize_rollback.sql`.
3. Expect `Rollback checks passed: 34 rows, price checksum …`.
4. Re-run inspection #1, #2, #4 and compare with the values from before migrating.

The result is the original columns and the original constraint name. Data is identical.
This was tested on a local replica: schema, constraints, data hash, sequence and policies all matched.

### R2 — Applied and the new sync has written rows
**Preferred: fix forward** instead of rolling back. New rows are verified WFP data, and
the legacy rows are untouched.

If you still need to roll back:
1. Stop the new backend's sync.
2. Make a copy of the rollback script. Delete its step **1a** and uncomment step **1b**.
   That archives the synced rows to `migration_backup.market_prices_001_synced_rows`
   and then removes them from `public.market_prices`.
3. Run it. The same post-checks apply. The sequence stays advanced, which is harmless.

The rollback **refuses by default** while synced rows exist, so it can never delete them
without that explicit edit.

### R3 — Legacy rows were changed or deleted after migrating
This is possible while the public `ALL` policy exists (see section 4).
1. Run the **preview** query at the top of `001_recovery_restore_legacy_rows.sql`.
2. Run the restore part. It restores changed rows and re-inserts deleted ones with their **original ids**.
3. Expect `Recovery checks passed: 34 legacy rows …`. A second run is a no-op.

### Backup lifecycle
- `migration_backup.market_prices_001` holds the 34 original rows.
- `migration_backup.migration_001_meta` holds the dropped constraint name and the checksums.
- The schema is revoked from `anon`/`authenticated`, so it is not reachable through the API.
- Keep it until you're satisfied, then drop it manually with `DROP SCHEMA migration_backup CASCADE;`.
- Migration 001 refuses to run again while these backup tables exist.

## 4. RLS — proposed separately, NOT part of migration 001

**Finding:** the policy `Allow full service access on prices` is `FOR ALL TO public`.
In Postgres, `public` means **every role**, including Supabase's `anon` (the public API key).
Supabase grants `anon` full table privileges by default, so with this policy anyone holding
the anon key can insert, update or delete prices through the REST API.
On a local replica with the reported policies and Supabase-style grants, `anon` successfully
updated and deleted rows.

The `service_role` key already **bypasses RLS**, so the policy is not needed for the backend
if the backend uses the service-role key.

**Before changing anything, confirm** (read-only):
```sql
SELECT policyname, qual, with_check FROM pg_policies WHERE tablename = 'market_prices';   -- is it USING (true)?
SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role');
SELECT grantee, string_agg(privilege_type, ', ') FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'market_prices' GROUP BY grantee;
SELECT has_sequence_privilege('service_role', 'public.market_prices_id_seq', 'USAGE');
```
Also confirm which key type the backend's `SUPABASE_KEY` is: anon or service_role. Say only the type, never the value.

**Proposed hardening (only after the backend uses the service-role key):**
```sql
BEGIN;
DROP POLICY "Allow full service access on prices" ON public.market_prices;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.market_prices FROM anon, authenticated;
COMMIT;
-- Keeps "Allow public read access on prices" (SELECT): the API remains readable.
```
| | Impact |
|---|---|
| Mobile app | None. It talks only to the backend, never to Supabase directly. |
| Backend with **service_role** key | None. It bypasses RLS and needs table + sequence privileges, which Supabase grants by default. |
| Backend with **anon** key | **The sync would stop writing.** Switch `SUPABASE_KEY` to the service-role key first, keep it server-side only, and never put it in the mobile app. |
| Undo | `CREATE POLICY "Allow full service access on prices" ON public.market_prices FOR ALL TO public USING (true) WITH CHECK (true);` plus `GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.market_prices TO anon, authenticated;` |

## 5. Review checklist (before running 001 on Supabase)

- [ ] Read `001_market_prices_standardize.sql` end to end.
- [ ] Inspection #4 still shows **34 rows**. The migration aborts otherwise.
- [ ] Recorded before values: row count, `fair_price_checksum`, `id_checksum`, `max_id`, sequence `last_value`.
- [ ] Inspection #2 shows exactly one `UNIQUE (crop_name, region)` constraint. Note its name.
- [ ] Inspection #7 (duplicates) returns no rows.
- [ ] Inspection #8 region spellings match WFP's `admin1` names, e.g. `National Capital region`, `Region IV-A`. If they differ, legacy and verified rows form separate series. That's harmless, but tell the developer.
- [ ] Legacy `updated_at` converted to Manila time gives the expected placeholder date. Sync times after 16:00 UTC fall on the next Manila day.
- [ ] No other writer (old backend, scripts) is active during the migration.
- [ ] A Supabase backup or point-in-time recovery is available, as a second safety net besides `migration_backup`.
- [ ] You know which rollback path (R1/R2/R3) applies if something looks wrong afterwards.
- [ ] After running: NOTICE `checks passed`, checksums unchanged, the sequence still `34 / true`, policies unchanged.
- [ ] RLS hardening (section 4) is scheduled **separately**, after confirming the backend's key type.
