-- AgriVoice — Checks for security fix 002 (PROPOSED — for human review)
-- No section needs or contains credentials. Run one section at a time.
--
--   Section A  READ-ONLY. SELECT statements only: no transaction, no role change, no writes.
--   Section B  READ-ONLY. Re-runs parts of A after the fix, with the expected results.
--   Section C  NOT READ-ONLY. Opens a transaction, switches roles (SET LOCAL ROLE) and
--              attempts INSERT/UPDATE/DELETE that match zero rows, then always ROLLBACK.
--              It cannot change rows or the sequence position. The SQL Editor user must be
--              a member of anon, authenticated and service_role (postgres is, on Supabase).
--   Section D  NOT READ-ONLY. HTTP calls to the Supabase API from your own terminal;
--              D2 is a write attempt aimed at a row that does not exist.
--   Section E  How to confirm the backend sync; one read-only query.

-- ===========================================================================
-- A. READ-ONLY preflight — run BEFORE 002 and keep the output
-- ===========================================================================

-- A1. Server version, current user, table and sequence owners, RLS
--     002 needs PostgreSQL 15+ and a current user with the owners' privileges.
SELECT current_setting('server_version') AS server_version, current_user,
       (SELECT relowner::regrole FROM pg_class WHERE oid = 'public.market_prices'::regclass) AS table_owner,
       (SELECT relowner::regrole FROM pg_class WHERE oid = 'public.market_prices_id_seq'::regclass) AS sequence_owner,
       pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = 'public.market_prices'::regclass), 'USAGE') AS can_act_as_owner,
       (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.market_prices'::regclass) AS rls_enabled,
       (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.market_prices'::regclass) AS rls_forced;

-- A2. Policies. Expected: exactly these two, as inspected:
--       Allow public read access on prices   PERMISSIVE  SELECT  {public}  true   (null)
--       Allow full service access on prices  PERMISSIVE  ALL     {public}  true   (null or true)
SELECT policyname, permissive, cmd, roles, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'market_prices'
ORDER BY policyname;

-- A3. Direct grants on the table, its columns and the sequence, with the grantor.
--     002 stops if any of these exist: a PUBLIC grant (other than SELECT on the table),
--     a grant to anon/authenticated whose grantor is not the owner, or a grant made BY
--     anon/authenticated.
SELECT obj, CASE grantee WHEN 0 THEN 'PUBLIC' ELSE grantee::regrole::text END AS grantee,
       grantor::regrole AS grantor, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM (
    SELECT 'table' AS obj, a.* FROM pg_class c, aclexplode(c.relacl) a
    WHERE c.oid = 'public.market_prices'::regclass
    UNION ALL
    SELECT 'column ' || att.attname, a.* FROM pg_attribute att, aclexplode(att.attacl) a
    WHERE att.attrelid = 'public.market_prices'::regclass AND att.attnum > 0 AND att.attacl IS NOT NULL
    UNION ALL
    SELECT 'sequence', a.* FROM pg_class c, aclexplode(c.relacl) a
    WHERE c.oid = 'public.market_prices_id_seq'::regclass
) acl
GROUP BY obj, grantee, grantor ORDER BY obj, 2, 3;

-- A4. Role attributes, and every role the API roles belong to, directly or indirectly.
--     "inherits" = false means the privileges are not inherited, but SET ROLE is still
--     possible; 002 treats both as membership.
SELECT rolname, rolsuper, rolbypassrls, rolinherit
FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role', 'authenticator')
ORDER BY rolname;

SELECT m.rolname AS api_role, g.rolname AS member_of, g.rolsuper, g.rolbypassrls,
       pg_has_role(m.oid, g.oid, 'USAGE') AS inherits
FROM pg_roles m
JOIN pg_roles g ON g.oid <> m.oid AND pg_has_role(m.oid, g.oid, 'MEMBER')
WHERE m.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY 1, 2;

-- A5. Effective privilege matrix (repeated in B1). Each privilege is checked on its own.
SELECT r AS role,
  has_table_privilege(r, 'public.market_prices', 'SELECT')     AS sel,
  has_table_privilege(r, 'public.market_prices', 'INSERT')     AS ins,
  has_table_privilege(r, 'public.market_prices', 'UPDATE')     AS upd,
  has_table_privilege(r, 'public.market_prices', 'DELETE')     AS del,
  has_table_privilege(r, 'public.market_prices', 'TRUNCATE')   AS trunc,
  has_table_privilege(r, 'public.market_prices', 'REFERENCES') AS refs,
  has_table_privilege(r, 'public.market_prices', 'TRIGGER')    AS trig,
  has_any_column_privilege(r, 'public.market_prices', 'INSERT') AS col_ins,
  has_any_column_privilege(r, 'public.market_prices', 'UPDATE') AS col_upd,
  has_sequence_privilege(r, 'public.market_prices_id_seq', 'USAGE')  AS seq_usage,
  has_sequence_privilege(r, 'public.market_prices_id_seq', 'UPDATE') AS seq_upd
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r;
-- PostgreSQL 17+ only (errors on 15/16): MAINTAIN
-- SELECT r, has_table_privilege(r, 'public.market_prices', 'MAINTAIN')
-- FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r;

-- A6. Other write paths that 002 checks automatically
-- A6a. Views and rules over the table, directly or through other views
WITH RECURSIVE dependent(relid) AS (
    SELECT rw.ev_class FROM pg_depend d JOIN pg_rewrite rw ON rw.oid = d.objid
    WHERE d.classid = 'pg_rewrite'::regclass AND d.refclassid = 'pg_class'::regclass
      AND d.refobjid = 'public.market_prices'::regclass AND rw.ev_class <> d.refobjid
    UNION
    SELECT rw.ev_class FROM dependent JOIN pg_depend d ON d.refobjid = dependent.relid
    JOIN pg_rewrite rw ON rw.oid = d.objid
    WHERE d.classid = 'pg_rewrite'::regclass AND d.refclassid = 'pg_class'::regclass
      AND rw.ev_class <> dependent.relid
)
SELECT relid::regclass AS view_or_table_with_rule, c.relkind, c.relowner::regrole AS owner,
       has_table_privilege('anon', relid, 'INSERT') OR has_table_privilege('anon', relid, 'UPDATE')
       OR has_table_privilege('anon', relid, 'DELETE') AS anon_can_write
FROM dependent JOIN pg_class c ON c.oid = relid;

-- A6b. Foreign keys from market_prices with cascading actions (expected: none)
SELECT conname, confrelid::regclass AS referenced_table, confdeltype, confupdtype
FROM pg_constraint WHERE conrelid = 'public.market_prices'::regclass AND contype = 'f';

-- A6c. SECURITY DEFINER functions outside pg_catalog/information_schema whose owner can
--      write market_prices. 002 stops on rows here that are NOT in a Supabase-managed
--      schema (auth, storage, realtime, extensions, graphql, vault, ...).
SELECT n.nspname AS schema, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       p.proowner::regrole AS owner,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef
  AND n.nspname <> 'information_schema' AND n.nspname NOT LIKE 'pg\_%'
  AND (has_table_privilege(p.proowner, 'public.market_prices', 'INSERT')
       OR has_table_privilege(p.proowner, 'public.market_prices', 'UPDATE')
       OR has_table_privilege(p.proowner, 'public.market_prices', 'DELETE')
       OR has_table_privilege(p.proowner, 'public.market_prices', 'TRUNCATE'))
ORDER BY 1, 2;

-- A7. Write paths that CANNOT be checked automatically — review manually
--   * Supabase-managed SECURITY DEFINER functions (A6c rows in auth, storage, ...): trusted,
--     not analysed. Their code is not inspected for dynamic SQL.
--   * Scheduled jobs (pg_cron), if the extension is installed:
--       SELECT jobname, schedule, command FROM cron.job;     -- errors if pg_cron is absent
--   * Event triggers and triggers on OTHER tables that call SECURITY DEFINER functions
--     (covered by A6c only for non-managed schemas):
--       SELECT evtname, evtevent, evtfoid::regproc FROM pg_event_trigger;
--   * Anything outside the database's privilege system: Edge Functions, database
--     webhooks, scripts or servers holding the secret key, and dashboard users.

-- A8. Default privileges (information only). They apply to FUTURE tables, which 002 does
--     not change. Supabase grants anon/authenticated access to new tables in public by
--     default, so every new table needs its own RLS and grants review.
SELECT d.defaclrole::regrole AS for_objects_created_by, n.nspname AS schema,
       d.defaclobjtype AS object_type, d.defaclacl
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public' OR n.nspname IS NULL;

-- A9. Data fingerprint (must be identical after 002)
SELECT count(*) AS row_count, sum(fair_price_per_kg) AS price_sum, sum(id) AS id_sum
FROM public.market_prices;
SELECT last_value, is_called FROM public.market_prices_id_seq;

-- ===========================================================================
-- B. READ-ONLY post-change verification — run AFTER 002
-- ===========================================================================
-- 002 prints: "Security fix 002 checks passed: ...". If it printed an ERROR instead,
-- nothing was changed.
-- B1. Re-run A5. Expected:
--       anon, authenticated: sel = true; every other column false
--       service_role:        sel, ins, upd, seq_usage = true (unchanged)
-- B2. Re-run A2. Expected: only "Allow public read access on prices" (SELECT).
-- B3. Re-run A3. Expected for anon and authenticated: only "table | SELECT"; no column or
--     sequence rows. Rows for other roles (owner, service_role) are unchanged.
-- B4. Re-run A9. Expected: the same values as before (e.g. 34 / 4196.61 / 595 and
--     sequence 34 / true, if migration 001 and the new sync have not run yet).

-- ===========================================================================
-- C. NOT READ-ONLY: behaviour tests (transaction, role switching, zero-row writes)
-- ===========================================================================
-- Privileges are checked before any row is read, so "WHERE false" still shows whether
-- the role may write. INSERT ... SELECT ... WHERE false produces no row, so nextval is
-- never called. TRUNCATE is not tested here (it cannot be made zero-row); A5 covers it.
-- Before the fix, C1 prints FAIL warnings (expected). After the fix, every line is OK.
BEGIN;

DO $$
DECLARE
    r text;
    stmt text;
    n bigint;
BEGIN
    -- C1. Public roles: reads succeed, writes are refused
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        EXECUTE format('SET LOCAL ROLE %I', r);
        BEGIN
            SELECT count(*) INTO n FROM public.market_prices;
            RAISE NOTICE 'OK: % can read (% rows visible)', r, n;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE WARNING 'FAIL: % cannot read market_prices', r;
        END;

        FOREACH stmt IN ARRAY ARRAY[
            'INSERT INTO public.market_prices (crop_name, region, fair_price_per_kg) SELECT ''x'', ''x'', 0 WHERE false',
            'UPDATE public.market_prices SET fair_price_per_kg = fair_price_per_kg WHERE false',
            'DELETE FROM public.market_prices WHERE false'] LOOP
            BEGIN
                EXECUTE stmt;
                RAISE WARNING 'FAIL: % is allowed to %', r, split_part(stmt, ' ', 1);
            EXCEPTION WHEN insufficient_privilege THEN
                RAISE NOTICE 'OK: % refused %', r, split_part(stmt, ' ', 1);
            END;
        END LOOP;
        RESET ROLE;
    END LOOP;

    -- C2. Backend role: the statements an upsert needs are allowed.
    --     Uses only columns that exist before and after migration 001.
    SET LOCAL ROLE service_role;
    FOREACH stmt IN ARRAY ARRAY[
        'SELECT count(*) FROM public.market_prices',
        'INSERT INTO public.market_prices (crop_name, region, fair_price_per_kg) SELECT ''x'', ''x'', 0 WHERE false',
        'UPDATE public.market_prices SET fair_price_per_kg = fair_price_per_kg WHERE false'] LOOP
        BEGIN
            EXECUTE stmt;
            RAISE NOTICE 'OK: service_role may %', split_part(stmt, ' ', 1);
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE WARNING 'FAIL: service_role refused %', split_part(stmt, ' ', 1);
        END;
    END LOOP;
    RESET ROLE;
    -- Sequence use (nextval) is not tested here because it would advance the sequence;
    -- A5 seq_usage covers it.
END $$;

ROLLBACK;

-- ===========================================================================
-- D. NOT READ-ONLY: API-level checks from your own terminal (optional)
-- ===========================================================================
-- Use the PUBLISHABLE / anon key only, never the secret key. Never paste keys anywhere:
--   read -rs ANON_KEY          # paste the key; nothing is shown
--   PROJECT=https://<project-ref>.supabase.co
--
-- D1. Public read (read-only). Expect HTTP 200:
--   curl -s -o /dev/null -w '%{http_code}\n' "$PROJECT/rest/v1/market_prices?select=id&limit=1" \
--        -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
--
-- D2. Public write attempt (a WRITE request). It targets id -1, which does not exist, so
--     it changes nothing even before the fix (HTTP 204). After the fix expect HTTP 401
--     (or 403) with code 42501, "permission denied for table market_prices":
--   curl -s -w '\n%{http_code}\n' -X PATCH "$PROJECT/rest/v1/market_prices?id=eq.-1" \
--        -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
--        -H "Content-Type: application/json" -d '{"province": null}'

-- ===========================================================================
-- E. Backend price sync
-- ===========================================================================
-- The new backend sync writes migration 001's columns, so until 001 is applied it fails
-- whether or not 002 has run. The backend log then shows "Price sync failed; existing
-- market_prices rows were left unchanged". Use C2 as the check for that period.
-- After 001 is applied and the new backend is deployed:
--   * the backend log shows "Price sync complete: <n> rows upserted"
--   * GET /api/v1/market/prices on the backend returns prices
--   * read-only:
--       SELECT is_legacy, count(*), max(updated_at) FROM public.market_prices GROUP BY 1;
--     shows is_legacy = false rows with a recent updated_at
-- "permission denied" / 42501 in the sync log means the deployed SUPABASE_KEY is not the
-- secret (service_role) key. Fix the key; do not grant anon or authenticated write access.
