-- AgriVoice — Rollback of security fix 003
-- Restores the default privileges inspected on 2026-11-23: anon and authenticated get ALL on
-- new tables (arwdDxtm) and new sequences (rwU) that postgres creates in schema public.
-- Tables created while 003 was active keep the privileges they were created with; grant on
-- those individually if needed. Run in the Supabase SQL Editor. One transaction.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION 'The rollback must run as postgres, not %.', current_user;
    END IF;
END $$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;

DO $$
BEGIN
    IF (SELECT count(DISTINCT a.grantee::regrole::text || ':' || d.defaclobjtype)
        FROM pg_default_acl d
        JOIN pg_namespace n ON n.oid = d.defaclnamespace
        CROSS JOIN LATERAL aclexplode(d.defaclacl) a
        WHERE d.defaclrole = 'postgres'::regrole AND n.nspname = 'public' AND d.defaclobjtype IN ('r', 'S')
          AND a.grantee IN ('anon'::regrole::oid, 'authenticated'::regrole::oid)) <> 4 THEN
        RAISE EXCEPTION 'Default privileges were not restored for both roles on tables and sequences.';
    END IF;
    RAISE NOTICE 'Rollback 003 checks passed: new tables and sequences in public are open to anon/authenticated again.';
END $$;

COMMIT;
