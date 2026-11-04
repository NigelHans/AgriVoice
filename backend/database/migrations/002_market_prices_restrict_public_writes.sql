-- AgriVoice — Security fix 002: make public.market_prices read-only for the public API roles
-- STATUS: PROPOSED — for human review. Run section A of
--         002_market_prices_restrict_public_writes_checks.sql (read-only) first.
--
-- Problem (inspected on the live project):
--   * Policy "Allow full service access on prices" is FOR ALL TO public USING (true).
--     "public" means every role, including anon (the publishable/anon API key).
--   * anon and authenticated hold SELECT, INSERT, UPDATE, DELETE, TRUNCATE, ... on the table.
--   Together, anyone with the public key can change or delete prices through the API.
--
-- What it changes:
--   1. Drops the policy "Allow full service access on prices"
--   2. Revokes every table and column privilege the table owner granted to anon and
--      authenticated, then grants back SELECT on the table only
--   3. Revokes every privilege the sequence owner granted to anon and authenticated on
--      market_prices_id_seq (the public roles never insert, so they never need it)
--
-- What it does NOT change (post-checks verify the first three):
--   * rows, ids, the sequence position, columns, constraints or indexes
--   * the policy "Allow public read access on prices", or RLS being enabled
--   * service_role, postgres or any other role. The backend's server-side secret
--     (service_role) key keeps reading and upserting: service_role bypasses RLS and
--     keeps its own table and sequence grants.
--   * grants to PUBLIC, grants made by other grantors, or default privileges for future
--     tables. If any of these would leave the public roles able to write, the script
--     stops instead (see "Stops without changing anything" below).
--   * migration 001. This script can run before or after it.
--
-- Stops without changing anything (one transaction; any failed check raises an error
-- and everything is rolled back) when:
--   * the table, its id default, the sequence, the roles or RLS differ from the inspection
--   * the read policy is not exactly FOR SELECT TO public USING (true), the ALL policy
--     (if still present) is not exactly as inspected, or any other policy exists
--   * the current user does not have the privileges of the table and sequence owners
--     (REVOKE and DROP POLICY act as the owner and only remove the owner's grants)
--   * any grant on the table, its columns or the sequence would survive the REVOKE:
--     grants to PUBLIC (other than SELECT on the table), grants to anon/authenticated
--     made by a grantor other than the owner, or grants made BY anon/authenticated
--   * anon/authenticated are superuser, bypass RLS, own the table, or are members
--     (inherited or not) of a role that can write to the table or use the sequence
--   * service_role lacks BYPASSRLS, SELECT, INSERT, UPDATE or USAGE on the sequence
--   * a view or rule over the table (directly or through other views) is writable by
--     the public roles, or a foreign key with ON DELETE/UPDATE actions lets a write to
--     another table they can change cascade into market_prices
--   * a SECURITY DEFINER function outside the Supabase-managed schemas is owned by a
--     role that can write market_prices (unless listed in reviewed_functions below)
--   * after the change: anon/authenticated still hold any write privilege by any route,
--     lost SELECT, a non-SELECT policy remains, service_role lost a privilege, or the
--     data, sequence position or table structure changed
--
-- What cannot be detected automatically — review manually (checks file, section A7):
--   * SECURITY DEFINER functions in Supabase-managed schemas (auth, storage, extensions, ...)
--     are trusted and not checked
--   * write paths outside the database's privilege system: pg_cron jobs, Edge Functions or
--     other servers using the secret key, database webhooks, and anyone holding the secret
--     key or a dashboard login
--   * a SECURITY DEFINER function's code is not analysed. The check flags it by its
--     owner's privileges, so dynamic SQL and nested calls are covered only for user schemas.
--
-- Locks: after the preflight, takes SHARE ROW EXCLUSIVE (blocks writes, not reads) until COMMIT,
-- and ACCESS EXCLUSIVE from DROP POLICY until COMMIT (milliseconds; reads wait that long).
-- Gives up after 5s instead of queueing behind long queries.
-- Running it again after a successful run is safe and changes nothing.
-- Requires PostgreSQL 15 or newer (Supabase); checks MAINTAIN on 17 and newer.
--
-- Recovery — do NOT recreate the ALL policy or grant writes to anon, authenticated or
-- PUBLIC; that reopens the hole. (The "Undo" line in 001_rollback_and_recovery.md §4
-- does exactly that and must not be used.)
--   * The script stopped with an error: nothing changed. Fix the reported cause, or ask.
--   * Public reads stopped working after it succeeded:
--       GRANT SELECT ON TABLE public.market_prices TO anon, authenticated;
--     and, only if the read policy is missing:
--       CREATE POLICY "Allow public read access on prices" ON public.market_prices
--           FOR SELECT TO public USING (true);
--   * The backend sync fails with "permission denied" (42501): first confirm the deployed
--     SUPABASE_KEY is the secret / service_role key, never the publishable / anon key.
--     Only if service_role itself lost privileges:
--       GRANT SELECT, INSERT, UPDATE ON TABLE public.market_prices TO service_role;
--       GRANT USAGE ON SEQUENCE public.market_prices_id_seq TO service_role;
--   * A trusted tool that cannot use the secret key needs to write: give it its own role
--     with narrowly scoped grants and policies, never TO public, anon or authenticated.

BEGIN;

SET LOCAL lock_timeout = '5s';        -- give up instead of queueing behind long queries
SET LOCAL statement_timeout = '30s';

-- ---------------------------------------------------------------------------
-- 1. Preflight: stop if the database is not in the inspected state
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    -- After reviewing a flagged SECURITY DEFINER function and confirming it cannot write
    -- market_prices, add its signature here, e.g. 'public.my_function(integer)'
    reviewed_functions text[] := ARRAY[]::text[];

    managed_schemas text[] := ARRAY['auth', 'storage', 'realtime', '_realtime', 'extensions',
        'graphql', 'graphql_public', 'pgsodium', 'pgsodium_masks', 'vault', 'net',
        'supabase_functions', 'supabase_migrations', 'cron', 'pgbouncer', '_analytics', 'pgmq'];

    tbl regclass := to_regclass('public.market_prices');
    seq regclass := to_regclass('public.market_prices_id_seq');
    tbl_owner oid;
    seq_owner oid;
    anon_oid oid := (SELECT oid FROM pg_roles WHERE rolname = 'anon');
    auth_oid oid := (SELECT oid FROM pg_roles WHERE rolname = 'authenticated');
    tbl_write text[] := ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
    col_write text[] := ARRAY['INSERT', 'UPDATE', 'REFERENCES'];
    seq_privs text[] := ARRAY['USAGE', 'SELECT', 'UPDATE'];
    rel_write text[] := ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'];
    found text;
BEGIN
    IF current_setting('server_version_num')::int < 150000 THEN
        RAISE EXCEPTION 'PostgreSQL 15 or newer required; this is %', current_setting('server_version');
    END IF;
    IF current_setting('server_version_num')::int >= 170000 THEN
        tbl_write := tbl_write || 'MAINTAIN';
    END IF;

    -- Objects and roles
    IF tbl IS NULL OR seq IS NULL THEN
        RAISE EXCEPTION 'public.market_prices or public.market_prices_id_seq not found';
    END IF;
    IF (SELECT relkind FROM pg_class WHERE oid = tbl) <> 'r'
       OR (SELECT relkind FROM pg_class WHERE oid = seq) <> 'S' THEN
        RAISE EXCEPTION 'market_prices is not a plain table or market_prices_id_seq is not a sequence';
    END IF;
    IF anon_oid IS NULL OR auth_oid IS NULL
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        RAISE EXCEPTION 'Role anon, authenticated or service_role is missing';
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = tbl) THEN
        RAISE EXCEPTION 'RLS is not enabled on public.market_prices; review before continuing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_attrdef d
                   JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
                   WHERE d.adrelid = tbl AND a.attname = 'id'
                     AND pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval(%market_prices_id_seq%') THEN
        RAISE EXCEPTION 'market_prices.id does not default to nextval(market_prices_id_seq)';
    END IF;

    -- REVOKE and DROP POLICY act as the owner; they need the owner's privileges
    SELECT relowner INTO tbl_owner FROM pg_class WHERE oid = tbl;
    SELECT relowner INTO seq_owner FROM pg_class WHERE oid = seq;
    IF NOT pg_has_role(current_user, tbl_owner, 'USAGE')
       OR NOT pg_has_role(current_user, seq_owner, 'USAGE') THEN
        RAISE EXCEPTION 'Run this as the owner of the table (%) and sequence (%), e.g. postgres in the Supabase SQL Editor; current user is %',
            tbl_owner::regrole, seq_owner::regrole, current_user;
    END IF;

    -- Policies: the read policy exactly as inspected ...
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = 'market_prices'
                     AND policyname = 'Allow public read access on prices'
                     AND cmd = 'SELECT' AND permissive = 'PERMISSIVE'
                     AND roles = '{public}'::name[] AND qual = 'true' AND with_check IS NULL) THEN
        RAISE EXCEPTION 'Policy "Allow public read access on prices" is missing or is no longer FOR SELECT TO public USING (true)';
    END IF;
    -- ... the ALL policy exactly as inspected, or already gone (re-run) ...
    IF EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'public' AND tablename = 'market_prices'
                 AND policyname = 'Allow full service access on prices'
                 AND NOT (cmd = 'ALL' AND permissive = 'PERMISSIVE' AND roles = '{public}'::name[]
                          AND qual = 'true' AND coalesce(with_check, 'true') = 'true')) THEN
        RAISE EXCEPTION 'Policy "Allow full service access on prices" differs from the inspection; review it first';
    END IF;
    -- ... and nothing else
    SELECT string_agg(format('%s (%s, %s)', policyname, cmd, permissive), ', ') INTO found
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'market_prices'
      AND policyname NOT IN ('Allow public read access on prices', 'Allow full service access on prices');
    IF found IS NOT NULL THEN
        RAISE EXCEPTION 'Unexpected policies on market_prices: %. Review them first.', found;
    END IF;

    -- Grants the owner's REVOKE could not remove, or that would make it fail
    WITH acl AS (
        SELECT 'table' AS obj, tbl_owner AS obj_owner, a.grantor, a.grantee, a.privilege_type
        FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = tbl
        UNION ALL
        SELECT 'column ' || att.attname, tbl_owner, a.grantor, a.grantee, a.privilege_type
        FROM pg_attribute att, aclexplode(att.attacl) a
        WHERE att.attrelid = tbl AND att.attnum > 0 AND att.attacl IS NOT NULL
        UNION ALL
        SELECT 'sequence', seq_owner, a.grantor, a.grantee, a.privilege_type
        FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = seq
    )
    SELECT string_agg(format('%s %s to %s by %s', obj, privilege_type,
                             CASE grantee WHEN 0 THEN 'PUBLIC' ELSE grantee::regrole::text END,
                             grantor::regrole), '; ') INTO found
    FROM acl
    WHERE (grantee = 0 AND NOT (obj = 'table' AND privilege_type = 'SELECT'))
       OR (grantee IN (anon_oid, auth_oid) AND grantor <> obj_owner)
       OR grantor IN (anon_oid, auth_oid);
    IF found IS NOT NULL THEN
        RAISE EXCEPTION 'Grants that this script cannot safely revoke: %. Review them first.', found;
    END IF;

    -- Public roles: no superuser, BYPASSRLS or ownership, also through any membership
    -- ('MEMBER' includes memberships without INHERIT, which still allow SET ROLE)
    SELECT string_agg(DISTINCT format('%s -> %s', m.rolname, g.rolname), ', ') INTO found
    FROM pg_roles m
    JOIN pg_roles g ON pg_has_role(m.oid, g.oid, 'MEMBER')
    WHERE m.oid IN (anon_oid, auth_oid)
      AND (g.rolsuper OR g.rolbypassrls OR g.oid IN (tbl_owner, seq_owner)
           OR (g.oid <> m.oid AND (
                  EXISTS (SELECT 1 FROM unnest(tbl_write) p WHERE has_table_privilege(g.oid, tbl, p))
               OR EXISTS (SELECT 1 FROM unnest(col_write) p WHERE has_any_column_privilege(g.oid, tbl, p))
               OR EXISTS (SELECT 1 FROM unnest(seq_privs) p WHERE has_sequence_privilege(g.oid, seq, p)))));
    IF found IS NOT NULL THEN
        RAISE EXCEPTION 'Public role is superuser, bypasses RLS, owns the objects, or is a member of a role that can write: %', found;
    END IF;

    -- The backend sync (upsert with returned rows) needs these; this script does not change them
    IF NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role')
       OR NOT has_table_privilege('service_role', tbl, 'SELECT')
       OR NOT has_table_privilege('service_role', tbl, 'INSERT')
       OR NOT has_table_privilege('service_role', tbl, 'UPDATE')
       OR NOT has_sequence_privilege('service_role', seq, 'USAGE') THEN
        RAISE EXCEPTION 'service_role lacks BYPASSRLS, SELECT/INSERT/UPDATE on market_prices, or USAGE on its sequence';
    END IF;

    -- Views and rules over the table, directly or through other views. Unless they are
    -- security_invoker, writes through them use their owner's privileges.
    WITH RECURSIVE dependent(relid) AS (
        SELECT rw.ev_class
        FROM pg_depend d JOIN pg_rewrite rw ON rw.oid = d.objid
        WHERE d.classid = 'pg_rewrite'::regclass AND d.refclassid = 'pg_class'::regclass
          AND d.refobjid = tbl AND rw.ev_class <> tbl
        UNION
        SELECT rw.ev_class
        FROM dependent JOIN pg_depend d ON d.refobjid = dependent.relid
        JOIN pg_rewrite rw ON rw.oid = d.objid
        WHERE d.classid = 'pg_rewrite'::regclass AND d.refclassid = 'pg_class'::regclass
          AND rw.ev_class <> dependent.relid
    )
    SELECT string_agg(DISTINCT relid::regclass::text, ', ') INTO found
    FROM dependent, unnest(ARRAY[anon_oid, auth_oid]) r, unnest(rel_write) p
    WHERE has_table_privilege(r, relid, p);
    IF found IS NOT NULL THEN
        RAISE EXCEPTION 'Public roles can write through view(s) or rule(s) over market_prices: %', found;
    END IF;

    -- Foreign keys from market_prices with cascading actions run as the table owner
    SELECT string_agg(DISTINCT format('%s -> %s', con.conname, con.confrelid::regclass), ', ') INTO found
    FROM pg_constraint con, unnest(ARRAY[anon_oid, auth_oid]) r, unnest(ARRAY['UPDATE', 'DELETE']) p
    WHERE con.conrelid = tbl AND con.contype = 'f'
      AND (con.confdeltype IN ('c', 'n', 'd') OR con.confupdtype IN ('c', 'n', 'd'))
      AND has_table_privilege(r, con.confrelid, p);
    IF found IS NOT NULL THEN
        RAISE EXCEPTION 'Public roles can change a table whose cascading foreign key writes into market_prices: %', found;
    END IF;

    -- SECURITY DEFINER functions run with their owner's privileges. Flagged by the owner's
    -- rights, not by their code, so dynamic SQL and nested calls are covered too.
    -- Not checked for EXECUTE: trigger functions run without it.
    SELECT string_agg(f, ', ') INTO found
    FROM unnest(reviewed_functions) f WHERE to_regprocedure(f) IS NULL;
    IF found IS NOT NULL THEN
        RAISE EXCEPTION 'reviewed_functions entries not found: %', found;
    END IF;

    SELECT string_agg(format('%I.%I(%s)', n.nspname, p.proname,
                             (SELECT coalesce(string_agg(format_type(t, NULL), ', ' ORDER BY i), '')
                              FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY AS a(t, i))), ', ') INTO found
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname <> 'information_schema' AND n.nspname NOT LIKE 'pg\_%'
      AND n.nspname <> ALL (managed_schemas)
      AND p.oid <> ALL (SELECT to_regprocedure(f)::oid FROM unnest(reviewed_functions) f)
      AND EXISTS (SELECT 1 FROM unnest(rel_write) w WHERE has_table_privilege(p.proowner, tbl, w));
    IF found IS NOT NULL THEN
        RAISE EXCEPTION 'SECURITY DEFINER function(s) whose owner can write market_prices: %. Review each; if it cannot write market_prices, add it to reviewed_functions.', found;
    END IF;
END $$;

-- Keep writers out so the before/after comparison is exact; reads continue.
-- After the preflight, so a non-owner gets the clear error above instead of a lock error.
LOCK TABLE public.market_prices IN SHARE ROW EXCLUSIVE MODE;

-- Remember data, sequence position and structure; the post-check compares them
DO $$
DECLARE
    tbl regclass := 'public.market_prices'::regclass;
    fingerprint text;
BEGIN
    SELECT concat_ws(' | ',
        (SELECT format('%s rows, md5 %s', count(*), md5(coalesce(string_agg(t::text, ',' ORDER BY t.id), '')))
         FROM public.market_prices t),
        (SELECT format('seq %s/%s', last_value, is_called) FROM public.market_prices_id_seq),
        (SELECT md5(coalesce(string_agg(format('%s %s %s %s', attnum, attname,
                                               format_type(atttypid, atttypmod), attnotnull), ',' ORDER BY attnum), ''))
         FROM pg_attribute WHERE attrelid = tbl AND attnum > 0 AND NOT attisdropped),
        (SELECT md5(coalesce(string_agg(conname || ' ' || pg_get_constraintdef(oid), ',' ORDER BY conname), ''))
         FROM pg_constraint WHERE conrelid = tbl),
        (SELECT md5(coalesce(string_agg(pg_get_indexdef(indexrelid), ',' ORDER BY indexrelid::regclass::text), ''))
         FROM pg_index WHERE indrelid = tbl))
    INTO fingerprint;
    PERFORM set_config('agrivoice.sec002_fingerprint', fingerprint, true);
END $$;

-- ---------------------------------------------------------------------------
-- 2. The change
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow full service access on prices" ON public.market_prices;

-- Removes the owner's table and column grants to these roles (and MAINTAIN on 17+)
REVOKE ALL ON TABLE public.market_prices FROM anon, authenticated;
GRANT SELECT ON TABLE public.market_prices TO anon, authenticated;

REVOKE ALL ON SEQUENCE public.market_prices_id_seq FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Post-checks: roll back unless public writes are really gone
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    tbl regclass := 'public.market_prices'::regclass;
    seq regclass := 'public.market_prices_id_seq'::regclass;
    anon_oid oid := (SELECT oid FROM pg_roles WHERE rolname = 'anon');
    auth_oid oid := (SELECT oid FROM pg_roles WHERE rolname = 'authenticated');
    tbl_write text[] := ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
    col_write text[] := ARRAY['INSERT', 'UPDATE', 'REFERENCES'];
    seq_privs text[] := ARRAY['USAGE', 'SELECT', 'UPDATE'];
    found text;
    fingerprint text;
BEGIN
    IF current_setting('server_version_num')::int >= 170000 THEN
        tbl_write := tbl_write || 'MAINTAIN';
    END IF;

    -- Effective privileges: has_*_privilege counts direct grants from any grantor, grants
    -- to PUBLIC and inherited memberships. Non-inherited memberships are checked below.
    SELECT string_agg(r::regrole || ' lacks SELECT', ', ') INTO found
    FROM unnest(ARRAY[anon_oid, auth_oid]) r
    WHERE NOT has_table_privilege(r, tbl, 'SELECT');
    IF found IS NOT NULL THEN
        RAISE EXCEPTION 'Public reads would break: %', found;
    END IF;

    SELECT string_agg(format('%s %s on %s', r::regrole, p, obj), ', ') INTO found
    FROM unnest(ARRAY[anon_oid, auth_oid]) r,
    LATERAL (SELECT 'table' AS obj, p FROM unnest(tbl_write) p WHERE has_table_privilege(r, tbl, p)
             UNION ALL
             SELECT 'a column', p FROM unnest(col_write) p WHERE has_any_column_privilege(r, tbl, p)
             UNION ALL
             SELECT 'sequence', p FROM unnest(seq_privs) p WHERE has_sequence_privilege(r, seq, p)) x;
    IF found IS NOT NULL THEN
        RAISE EXCEPTION 'Public roles still hold: %. Rolled back; nothing was changed.', found;
    END IF;

    -- Direct grants: the public roles hold SELECT on the table and nothing else
    WITH acl AS (
        SELECT 'table' AS obj, a.grantee, a.privilege_type
        FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = tbl
        UNION ALL
        SELECT 'column ' || att.attname, a.grantee, a.privilege_type
        FROM pg_attribute att, aclexplode(att.attacl) a
        WHERE att.attrelid = tbl AND att.attnum > 0 AND att.attacl IS NOT NULL
        UNION ALL
        SELECT 'sequence', a.grantee, a.privilege_type
        FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = seq
    )
    SELECT string_agg(format('%s %s to %s', obj, privilege_type,
                             CASE grantee WHEN 0 THEN 'PUBLIC' ELSE grantee::regrole::text END), ', ') INTO found
    FROM acl
    WHERE grantee IN (0, anon_oid, auth_oid) AND NOT (obj = 'table' AND privilege_type = 'SELECT');
    IF found IS NOT NULL THEN
        RAISE EXCEPTION 'Grants remain: %. Rolled back; nothing was changed.', found;
    END IF;

    -- Memberships, including non-inherited ones
    SELECT string_agg(DISTINCT format('%s -> %s', m.rolname, g.rolname), ', ') INTO found
    FROM pg_roles m
    JOIN pg_roles g ON pg_has_role(m.oid, g.oid, 'MEMBER')
    WHERE m.oid IN (anon_oid, auth_oid)
      AND (g.rolsuper OR g.rolbypassrls
           OR EXISTS (SELECT 1 FROM unnest(tbl_write) p WHERE has_table_privilege(g.oid, tbl, p))
           OR EXISTS (SELECT 1 FROM unnest(col_write) p WHERE has_any_column_privilege(g.oid, tbl, p))
           OR EXISTS (SELECT 1 FROM unnest(seq_privs) p WHERE has_sequence_privilege(g.oid, seq, p)));
    IF found IS NOT NULL THEN
        RAISE EXCEPTION 'Public roles can still write through membership: %', found;
    END IF;

    -- Policies: exactly the read policy remains
    SELECT string_agg(format('%s (%s)', policyname, cmd), ', ') INTO found
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'market_prices'
      AND NOT (policyname = 'Allow public read access on prices' AND cmd = 'SELECT'
               AND permissive = 'PERMISSIVE' AND roles = '{public}'::name[] AND qual = 'true');
    IF found IS NOT NULL
       OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'market_prices') THEN
        RAISE EXCEPTION 'Expected only the read policy; found also: %', coalesce(found, '(read policy missing)');
    END IF;

    -- Backend: RLS still on, service_role unchanged
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = tbl)
       OR NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role')
       OR NOT has_table_privilege('service_role', tbl, 'SELECT')
       OR NOT has_table_privilege('service_role', tbl, 'INSERT')
       OR NOT has_table_privilege('service_role', tbl, 'UPDATE')
       OR NOT has_sequence_privilege('service_role', seq, 'USAGE') THEN
        RAISE EXCEPTION 'RLS or service_role privileges changed unexpectedly';
    END IF;

    -- Data, sequence position and structure unchanged
    SELECT concat_ws(' | ',
        (SELECT format('%s rows, md5 %s', count(*), md5(coalesce(string_agg(t::text, ',' ORDER BY t.id), '')))
         FROM public.market_prices t),
        (SELECT format('seq %s/%s', last_value, is_called) FROM public.market_prices_id_seq),
        (SELECT md5(coalesce(string_agg(format('%s %s %s %s', attnum, attname,
                                               format_type(atttypid, atttypmod), attnotnull), ',' ORDER BY attnum), ''))
         FROM pg_attribute WHERE attrelid = tbl AND attnum > 0 AND NOT attisdropped),
        (SELECT md5(coalesce(string_agg(conname || ' ' || pg_get_constraintdef(oid), ',' ORDER BY conname), ''))
         FROM pg_constraint WHERE conrelid = tbl),
        (SELECT md5(coalesce(string_agg(pg_get_indexdef(indexrelid), ',' ORDER BY indexrelid::regclass::text), ''))
         FROM pg_index WHERE indrelid = tbl))
    INTO fingerprint;
    IF fingerprint IS DISTINCT FROM current_setting('agrivoice.sec002_fingerprint') THEN
        RAISE EXCEPTION 'Data, sequence or structure changed during the script: before %, after %',
            current_setting('agrivoice.sec002_fingerprint'), fingerprint;
    END IF;

    RAISE NOTICE 'Security fix 002 checks passed: anon/authenticated are read-only on market_prices; service_role, data and structure unchanged (%).',
        split_part(fingerprint, ' | ', 1);
END $$;

COMMIT;
