-- AgriVoice — Security fix 003: new tables in public are no longer open to the public API roles
--
-- Problem (inspected 2026-11-23, checks file 002 section A8):
--   Default privileges for objects that postgres creates in schema public grant anon and
--   authenticated ALL on new tables (arwdDxtm) and new sequences (rwU). Any table someone adds
--   later (SQL Editor, Table Editor, a script) is readable AND writable with the public key
--   until RLS is set up for it. market_prices itself is already protected by 002.
--
-- What it changes:
--   Default privileges FOR ROLE postgres IN SCHEMA public: anon and authenticated no longer
--   get any privilege on tables or sequences created from now on.
--
-- What it does NOT change (post-checks verify the first two):
--   * privileges on any existing table, view or sequence (market_prices keeps anon SELECT)
--   * service_role's default privileges (the backend can still use new tables)
--   * default privileges for objects created by supabase_admin (postgres cannot change those;
--     only Supabase's own tooling creates objects as supabase_admin)
--   * functions (PostgreSQL gives EXECUTE to PUBLIC anyway; review new functions one by one)
--
-- After this, a new table that the app must read with the public key needs, explicitly:
--     ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;
--     GRANT SELECT ON public.<t> TO anon, authenticated;
--     CREATE POLICY "<name>" ON public.<t> FOR SELECT TO anon, authenticated USING (<condition>);
--
-- Run: in the Supabase SQL Editor, or with backend/database/migrate.sh. One transaction;
-- any failed check raises an error and nothing changes. Undo: 003_restrict_default_privileges_rollback.sql

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 1. Preflight
DO $$
BEGIN
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION '003 must run as postgres (the SQL Editor default), not %.', current_user;
    END IF;
    IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) <> 3 THEN
        RAISE EXCEPTION 'Roles anon, authenticated and service_role must exist (is this the Supabase project?).';
    END IF;
END $$;

-- Privileges on every existing object in public, to prove they are untouched
CREATE TEMP TABLE m003_pre ON COMMIT DROP AS
SELECT c.oid, c.relacl::text AS acl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public';

-- 2. The change
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- 3. Post-checks
DO $$
DECLARE
    leftover text;
BEGIN
    SELECT string_agg(format('%s on %s', a.grantee::regrole, d.defaclobjtype), ', ') INTO leftover
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole = 'postgres'::regrole AND n.nspname = 'public' AND d.defaclobjtype IN ('r', 'S')
      AND a.grantee IN ('anon'::regrole::oid, 'authenticated'::regrole::oid);
    IF leftover IS NOT NULL THEN
        RAISE EXCEPTION 'Default privileges for the public roles remain: %.', leftover;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_default_acl d
        JOIN pg_namespace n ON n.oid = d.defaclnamespace
        CROSS JOIN LATERAL aclexplode(d.defaclacl) a
        WHERE d.defaclrole = 'postgres'::regrole AND n.nspname = 'public' AND d.defaclobjtype = 'r'
          AND a.grantee = 'service_role'::regrole::oid AND a.privilege_type = 'INSERT'
    ) THEN
        RAISE EXCEPTION 'service_role has no default INSERT on new tables in public (expected unchanged).';
    END IF;

    IF EXISTS (
        SELECT 1 FROM m003_pre p LEFT JOIN pg_class c ON c.oid = p.oid
        WHERE c.oid IS NULL OR c.relacl::text IS DISTINCT FROM p.acl
    ) THEN
        RAISE EXCEPTION 'Privileges on existing objects in public changed; aborting.';
    END IF;

    RAISE NOTICE 'Migration 003 checks passed: new tables and sequences in public get no anon/authenticated privileges.';
END $$;

COMMIT;
