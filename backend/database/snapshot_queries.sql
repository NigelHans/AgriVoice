-- AgriVoice — fresh READ-ONLY snapshot of public.market_prices (before migration 001)
--
-- Every query below is a plain SELECT against the table or the system catalogs.
-- None of them changes data, schema, privileges or the id sequence.
--
-- How to run (Supabase SQL Editor):
--   * Run ONE block at a time: the editor shows only the last result of a run.
--   * Save every result. R5 in particular: its totals and rows_hash feed the
--     corrected guard in migration 001 and are re-checked right before migrating.
--   * Run order: sections 1 → 8. Section 9 (R17) is NOT part of this snapshot;
--     run it only immediately before applying migration 001.
--
-- Source: R1–R13 are copied verbatim from the migration-001 audit; R14–R17 from
-- the follow-up review of those queries.


-- =============================================================================
-- 1. Environment
-- =============================================================================

-- R1 (READ-ONLY) server and session
-- Checks: Postgres version and the role you are connected as (expect postgres).
SELECT version(), current_user;


-- =============================================================================
-- 2. Structure
-- =============================================================================

-- R2 (READ-ONLY) columns: exact type, NOT NULL, default, identity, comment
-- Checks: varchar lengths / numeric precision, defaults (e.g. updated_at now()),
-- and the existing comment on fair_price_per_kg (migration 001 overwrites it).
SELECT a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) AS type,
       a.attnotnull AS not_null, pg_get_expr(d.adbin, d.adrelid) AS default_expr,
       a.attidentity AS identity, col_description(a.attrelid, a.attnum) AS comment
FROM pg_attribute a
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attrelid = 'public.market_prices'::regclass AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum;

-- R3 (READ-ONLY) constraints
-- Checks: constraint names and definitions (expect market_prices_pkey and
-- unique_crop_region before migration 001).
SELECT conname, contype, pg_get_constraintdef(oid) AS definition, condeferrable
FROM pg_constraint WHERE conrelid = 'public.market_prices'::regclass ORDER BY conname;

-- R4 (READ-ONLY) indexes
-- Checks: every index on the table and its full definition.
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'market_prices' ORDER BY indexname;


-- =============================================================================
-- 3. Sequence and ownership
-- =============================================================================

-- R8 (READ-ONLY) sequence configuration, state, owner and link to id
-- Checks: type, start, increment, min/max, cache, cycle, owner, whether the
-- sequence is linked to market_prices.id, and last_value / is_called.
-- Reading the sequence relation does not advance it.
SELECT s.seqtypid::regtype AS type, s.seqstart, s.seqincrement, s.seqmin, s.seqmax,
       s.seqcache, s.seqcycle, c.relowner::regrole AS owner,
       pg_get_serial_sequence('public.market_prices', 'id') AS linked_to_id,
       q.last_value, q.is_called
FROM pg_sequence s
JOIN pg_class c ON c.oid = s.seqrelid
CROSS JOIN public.market_prices_id_seq q
WHERE s.seqrelid = 'public.market_prices_id_seq'::regclass;

-- R9 (READ-ONLY) ownership and RLS
-- Checks: owners of the table and sequence, and whether row-level security is
-- enabled / forced on the table.
SELECT relname, relkind, relowner::regrole AS owner, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE oid IN ('public.market_prices'::regclass, 'public.market_prices_id_seq'::regclass);


-- =============================================================================
-- 4. Data
-- =============================================================================

-- R5 (READ-ONLY) rows, IDs, prices, timestamps + fingerprint of the 6 original columns
-- Checks: row count, distinct crop/region pairs, price and id checksums, id range,
-- prices that NUMERIC(10,2) would round, non-positive prices, NULL updated_at,
-- the updated_at range, and an md5 over the original columns (re-runnable after 001).
-- Expect: would_round = 0, null_updated_at = 0, distinct_pairs = total_rows.
SELECT count(*) AS total_rows,
       count(DISTINCT (crop_name, region)) AS distinct_pairs,
       count(DISTINCT crop_name) AS crops, count(DISTINCT region) AS regions,
       sum(fair_price_per_kg) AS fair_price_checksum, sum(id) AS id_checksum,
       min(id) AS min_id, max(id) AS max_id,
       min(fair_price_per_kg) AS min_price, max(fair_price_per_kg) AS max_price,
       count(*) FILTER (WHERE fair_price_per_kg <> round(fair_price_per_kg, 2)) AS would_round,
       count(*) FILTER (WHERE fair_price_per_kg <= 0) AS nonpositive,
       count(*) FILTER (WHERE updated_at IS NULL) AS null_updated_at,
       min(updated_at) AS first_updated, max(updated_at) AS last_updated,
       md5(string_agg((id, crop_name, region, province, fair_price_per_kg, updated_at)::text,
                      E'\n' ORDER BY id)) AS rows_hash
FROM public.market_prices;


-- =============================================================================
-- 5. Timeline and spellings
-- =============================================================================

-- R6 (READ-ONLY) write timeline: placeholder dates 001 would assign
-- Checks: when rows were last written (Manila date of updated_at), which is also
-- the placeholder price_date migration 001 gives legacy rows.
SELECT (updated_at AT TIME ZONE 'Asia/Manila')::date AS placeholder_price_date,
       count(*) AS rows, min(updated_at) AS first_ts, max(updated_at) AS last_ts
FROM public.market_prices GROUP BY 1 ORDER BY 1;

-- R7 (READ-ONLY) exact region and crop spellings
-- Checks: region and crop values exactly as stored (case-sensitive), with counts.
SELECT 'region' AS kind, region AS value, count(*) FROM public.market_prices GROUP BY region
UNION ALL
SELECT 'crop', crop_name, count(*) FROM public.market_prices GROUP BY crop_name
ORDER BY 1, 2;


-- =============================================================================
-- 6. Security and privileges
-- =============================================================================

-- R10 (READ-ONLY) policies, including conditions
-- Checks: every RLS policy on the table with its roles, command and conditions.
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'market_prices' ORDER BY policyname;

-- R11 (READ-ONLY) table, column and sequence grants with grantor (NULL ACL = owner defaults)
-- Checks: who holds which privilege on the table, its columns and the sequence,
-- and who granted it.
SELECT 'table' AS object, a.grantor::regrole::text AS grantor,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END AS grantee,
       a.privilege_type, a.is_grantable
FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
WHERE c.oid = 'public.market_prices'::regclass
UNION ALL
SELECT 'sequence', a.grantor::regrole::text,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,
       a.privilege_type, a.is_grantable
FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('s', c.relowner))) a
WHERE c.oid = 'public.market_prices_id_seq'::regclass
UNION ALL
SELECT 'column ' || att.attname, a.grantor::regrole::text,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,
       a.privilege_type, a.is_grantable
FROM pg_attribute att, aclexplode(att.attacl) a
WHERE att.attrelid = 'public.market_prices'::regclass AND att.attacl IS NOT NULL
ORDER BY 1, 3, 4;

-- R12 (READ-ONLY) relevant roles
-- Checks: superuser / bypass-RLS / inherit / login attributes of the roles that
-- matter for migrations 001 and 002 (missing roles simply do not appear).
SELECT rolname, rolsuper, rolbypassrls, rolinherit, rolcanlogin
FROM pg_roles
WHERE rolname IN ('postgres', 'anon', 'authenticated', 'service_role', 'authenticator', 'supabase_admin')
ORDER BY rolname;

-- R16 (READ-ONLY) default privileges that apply to tables added later (e.g. 001's backup table)
-- Checks: privileges that new tables receive automatically, per role and schema
-- (in_schema shows "-" for defaults that apply to every schema).
SELECT defaclrole::regrole AS for_role, defaclnamespace::regnamespace AS in_schema,
       defaclobjtype AS object_type, defaclacl AS privileges
FROM pg_default_acl ORDER BY 1, 2, 3;


-- =============================================================================
-- 7. Migration objects
-- =============================================================================

-- R13 (READ-ONLY) triggers, dependents, existing 001 objects, PostgREST reload trigger
-- Checks: user triggers on the table, views depending on it, publications, any
-- leftover migration-001 objects, the migration_backup schema, and the PostgREST
-- schema-reload event trigger.
-- Expect: no triggers, no dependent views, no "already exists" rows, and a
-- pgrst_ddl_watch event trigger.
SELECT 'trigger' AS kind, tgname::text AS name, pg_get_triggerdef(oid) AS detail
FROM pg_trigger WHERE tgrelid = 'public.market_prices'::regclass AND NOT tgisinternal
UNION ALL
SELECT 'dependent view', view_schema || '.' || view_name, NULL
FROM information_schema.view_table_usage
WHERE table_schema = 'public' AND table_name = 'market_prices'
UNION ALL
SELECT 'publication', pubname::text, NULL
FROM pg_publication_tables WHERE schemaname = 'public' AND tablename = 'market_prices'
UNION ALL
SELECT 'already exists', n, NULL
FROM unnest(ARRAY['migration_backup.market_prices_001', 'migration_backup.migration_001_meta',
                  'public.uq_market_prices_crop_region_date']) AS n
WHERE to_regclass(n) IS NOT NULL
UNION ALL
SELECT 'schema', nspname::text, nspowner::regrole::text FROM pg_namespace WHERE nspname = 'migration_backup'
UNION ALL
SELECT 'event trigger', evtname::text, evtevent || ' enabled=' || evtenabled
FROM pg_event_trigger WHERE evtname ILIKE '%pgrst%'
ORDER BY 1, 2;


-- =============================================================================
-- 8. Write activity
-- =============================================================================

-- R14 (READ-ONLY) write activity counters since statistics were last reset
-- Checks: live/dead rows and insert/update/delete counts; a high n_tup_ins or
-- n_dead_tup compared with the row count can point to failed or repeated writes.
SELECT n_live_tup, n_dead_tup, n_tup_ins, n_tup_upd, n_tup_del, n_tup_hot_upd,
       last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables WHERE relid = 'public.market_prices'::regclass;

-- R15 (READ-ONLY) which statements touched market_prices (values appear as $1, $2 — no data shown)
-- Checks: the normalized statements that ran against the table and how often.
-- Needs the pg_stat_statements extension; if it reports that the relation does
-- not exist, the extension is not enabled (or is outside your search_path).
SELECT calls, rows, left(query, 200) AS query
FROM pg_stat_statements
WHERE query ILIKE '%market_prices%' AND query NOT ILIKE '%pg_stat_statements%'
ORDER BY calls DESC LIMIT 20;


-- =============================================================================
-- 9. Pre-migration lock check — NOT part of the initial snapshot
-- =============================================================================

-- R17 (READ-ONLY) run ONLY right before applying migration 001: who is using the table now
-- Checks: other sessions holding or waiting for locks on the table.
-- Expect: no rows. Re-run R5 first and confirm it matches the saved snapshot.
SELECT a.pid, l.mode, l.granted, a.application_name, a.state, a.query_start
FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
WHERE l.relation = 'public.market_prices'::regclass AND a.pid <> pg_backend_pid();
