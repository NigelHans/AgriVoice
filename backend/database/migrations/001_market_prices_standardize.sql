-- AgriVoice — Migration 001: standardize public.market_prices
-- STATUS: PROPOSED — for human review. Do not run until the checklist in
--         001_rollback_and_recovery.md is complete.
--
-- Written against the live snapshot of 2026-11-04 (snapshot_queries.sql R1–R17):
--   PostgreSQL 17.6; id integer PK DEFAULT nextval('market_prices_id_seq'), crop_name varchar NOT NULL,
--   region varchar NOT NULL, province varchar, fair_price_per_kg numeric NOT NULL,
--   updated_at timestamptz; constraints market_prices_pkey and unique_crop_region (R3)
--   R5: 51 rows, fair_price_checksum 5231.11, id_checksum 3930, max_id 218, null_updated_at 0, would_round 0
--   R6: every updated_at falls on 2026-11-01 (Asia/Manila) — a sync time, not a verified report date
--   R8: sequence last_value 426, is_called true (upserts consume values; this migration never touches it)
--
-- BEFORE RUNNING: stop every other writer. The fix/mobile-entry-point backend upserts with
-- ON CONFLICT (crop_name, region); after this migration that conflict target no longer exists,
-- so its sync would fail. Replace it with the new backend in the same maintenance window.
--
-- What it does:
--   1. Copies the table to migration_backup.market_prices_001 (not exposed by the API)
--   2. Adds the documented columns: price_per_kg, price_date, unit, source, created_at,
--      plus is_legacy to mark the 51 pre-existing rows
--   3. Fills them for existing rows; legacy price_date = sync date (NOT a report date)
--   4. Replaces UNIQUE (crop_name, region) with UNIQUE (crop_name, region, price_date)
--      so monthly price history can be stored
--
-- What it does NOT do:
--   * delete, update or re-number existing values (id, crop_name, region, province,
--     fair_price_per_kg, updated_at are unchanged)
--   * drop fair_price_per_kg or its NOT NULL (the backend keeps writing it)
--   * touch the id sequence, RLS policies or grants
--
-- Safety: one transaction. Any failed check raises an error and everything rolls back.
-- The fixed R5/R6 values below make it refuse to run if the table changed after the snapshot.

BEGIN;

SET LOCAL lock_timeout = '5s';        -- give up instead of queueing behind long queries
SET LOCAL statement_timeout = '60s';

-- Block concurrent writes for the duration (reads continue until ALTER TABLE)
LOCK TABLE public.market_prices IN SHARE ROW EXCLUSIVE MODE;

-- ---------------------------------------------------------------------------
-- 0. Preconditions — stop if the table differs from what was inspected
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    snap            record;
    legacy_uniques  integer;
    legacy_name     text;
    -- Optional: paste rows_hash from your saved R5 result to also detect edits to names and
    -- provinces. Leave NULL to rely on the checksums below.
    expected_rows_hash text := NULL;
BEGIN
    -- Fixed values from the 2026-11-04 snapshot (R5, R6). Any difference means the table
    -- changed since it was inspected: stop, re-run snapshot_queries.sql and review again.
    SELECT count(*)                                   AS row_count,
           sum(fair_price_per_kg)                     AS price_sum,
           sum(id)                                    AS id_sum,
           max(id)                                    AS max_id,
           count(*) FILTER (WHERE (updated_at AT TIME ZONE 'Asia/Manila')::date <> DATE '2026-11-01') AS other_dates,
           md5(string_agg((id, crop_name, region, province, fair_price_per_kg, updated_at)::text, E'\n' ORDER BY id)) AS rows_hash
    INTO snap FROM public.market_prices;

    IF snap.row_count <> 51 OR snap.price_sum <> 5231.11 OR snap.id_sum <> 3930 OR snap.max_id <> 218 THEN
        RAISE EXCEPTION 'Table differs from the 2026-11-04 snapshot (expected 51 rows, 5231.11, 3930, max id 218): %. Re-inspect before migrating.',
            row_to_json(snap);
    END IF;

    IF snap.other_dates <> 0 THEN
        RAISE EXCEPTION '% rows have updated_at outside 2026-11-01 (Manila); something wrote after the snapshot.', snap.other_dates;
    END IF;

    IF expected_rows_hash IS NOT NULL AND snap.rows_hash <> expected_rows_hash THEN
        RAISE EXCEPTION 'rows_hash % differs from the R5 snapshot %.', snap.rows_hash, expected_rows_hash;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'market_prices'
                 AND column_name IN ('price_per_kg', 'price_date', 'unit', 'source', 'created_at', 'is_legacy')) THEN
        RAISE EXCEPTION 'market_prices already has a column added by this migration; it may have run already.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.market_prices WHERE updated_at IS NULL) THEN
        RAISE EXCEPTION 'Some rows have NULL updated_at; price_date cannot be derived for them.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.market_prices WHERE fair_price_per_kg <> round(fair_price_per_kg, 2)) THEN
        RAISE EXCEPTION 'Some prices have more than 2 decimals and would be rounded by NUMERIC(10,2).';
    END IF;

    SELECT count(*), min(c.conname) INTO legacy_uniques, legacy_name
    FROM pg_constraint c
    WHERE c.conrelid = 'public.market_prices'::regclass
      AND c.contype = 'u'
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
           FROM pg_attribute a
           WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) = ARRAY['crop_name', 'region'];
    IF legacy_uniques <> 1 OR legacy_name <> 'unique_crop_region' THEN
        RAISE EXCEPTION 'Expected exactly one UNIQUE (crop_name, region) constraint named unique_crop_region (R3), found % (%).',
            legacy_uniques, legacy_name;
    END IF;

    IF to_regclass('migration_backup.market_prices_001') IS NOT NULL
       OR to_regclass('migration_backup.migration_001_meta') IS NOT NULL THEN
        RAISE EXCEPTION 'migration_backup tables for 001 already exist; see 001_rollback_and_recovery.md.';
    END IF;
END $$;

-- Pre-migration checksums, compared at the end and kept for the rollback.
-- rows_hash uses the same expression as R5, over the six original columns only.
-- The original comment on fair_price_per_kg is saved because step 2 overwrites it.
CREATE TEMP TABLE m001_pre ON COMMIT DROP AS
SELECT count(*)               AS row_count,
       sum(fair_price_per_kg) AS price_sum,
       sum(id)                AS id_sum,
       max(id)                AS max_id,
       md5(string_agg((id, crop_name, region, province, fair_price_per_kg, updated_at)::text, E'\n' ORDER BY id)) AS rows_hash,
       col_description('public.market_prices'::regclass,
                       (SELECT attnum FROM pg_attribute
                        WHERE attrelid = 'public.market_prices'::regclass AND attname = 'fair_price_per_kg')
       ) AS fair_price_comment
FROM public.market_prices;

-- ---------------------------------------------------------------------------
-- 1. Backup copy in a schema the Supabase API does not expose
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS migration_backup;
REVOKE ALL ON SCHEMA migration_backup FROM PUBLIC, anon, authenticated;

CREATE TABLE migration_backup.market_prices_001 AS
SELECT * FROM public.market_prices;

-- Records what the migration changed, for the rollback script
CREATE TABLE migration_backup.migration_001_meta (
    applied_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dropped_constraint      TEXT,
    pre_row_count           BIGINT,
    pre_price_sum           NUMERIC,
    pre_id_sum              BIGINT,
    pre_rows_hash           TEXT,
    pre_fair_price_comment  TEXT     -- NULL when the column had no comment
);
INSERT INTO migration_backup.migration_001_meta
    (pre_row_count, pre_price_sum, pre_id_sum, pre_rows_hash, pre_fair_price_comment)
SELECT row_count, price_sum, id_sum, rows_hash, fair_price_comment FROM m001_pre;

-- R16: broad default privileges exist for new objects. Schema USAGE is already revoked;
-- revoke table privileges too, so the backup is unreachable even if the schema is exposed later.
REVOKE ALL ON ALL TABLES IN SCHEMA migration_backup FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Add documented columns (nullable first, so existing rows can be filled)
-- ---------------------------------------------------------------------------
ALTER TABLE public.market_prices
    ADD COLUMN price_per_kg NUMERIC(10, 2),
    ADD COLUMN price_date   DATE,
    ADD COLUMN unit         TEXT DEFAULT 'kg',
    ADD COLUMN source       TEXT,
    ADD COLUMN created_at   TIMESTAMPTZ,
    ADD COLUMN is_legacy    BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.market_prices.fair_price_per_kg IS
    'Legacy price column, kept for compatibility. The backend writes the same value to price_per_kg.';
COMMENT ON COLUMN public.market_prices.is_legacy IS
    'true = row created by the pre-2026-10 sync; its price_date is the sync date, not a verified report date.';

-- ---------------------------------------------------------------------------
-- 3. Fill new columns for the existing (legacy) rows
-- ---------------------------------------------------------------------------
UPDATE public.market_prices
SET price_per_kg = fair_price_per_kg,
    price_date   = (updated_at AT TIME ZONE 'Asia/Manila')::date,  -- placeholder: sync date
    unit         = 'kg',
    source       = 'legacy sync (report date unknown)',
    created_at   = updated_at,
    is_legacy    = true;

ALTER TABLE public.market_prices
    ALTER COLUMN price_per_kg SET NOT NULL,
    ALTER COLUMN price_date   SET NOT NULL,
    ALTER COLUMN created_at   SET DEFAULT NOW();

-- ---------------------------------------------------------------------------
-- 4. Switch uniqueness from (crop_name, region) to (crop_name, region, price_date)
--    New index first, so uniqueness is enforced at every point in the transaction.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX uq_market_prices_crop_region_date
    ON public.market_prices (crop_name, region, price_date);

DO $$
DECLARE
    legacy_constraint text;
BEGIN
    SELECT c.conname INTO STRICT legacy_constraint
    FROM pg_constraint c
    WHERE c.conrelid = 'public.market_prices'::regclass
      AND c.contype = 'u'
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
           FROM pg_attribute a
           WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) = ARRAY['crop_name', 'region'];

    EXECUTE format('ALTER TABLE public.market_prices DROP CONSTRAINT %I', legacy_constraint);
    UPDATE migration_backup.migration_001_meta SET dropped_constraint = legacy_constraint;
    RAISE NOTICE 'Dropped legacy constraint % (UNIQUE (crop_name, region)).', legacy_constraint;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Post-checks — any mismatch aborts and rolls back everything above
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    pre  record;
    post record;
BEGIN
    SELECT * INTO pre FROM m001_pre;
    SELECT count(*) AS row_count, sum(fair_price_per_kg) AS price_sum, sum(id) AS id_sum, max(id) AS max_id
    INTO post FROM public.market_prices;

    IF post.row_count <> pre.row_count OR post.price_sum <> pre.price_sum
       OR post.id_sum <> pre.id_sum OR post.max_id <> pre.max_id THEN
        RAISE EXCEPTION 'Checksum mismatch. before=% after=%', row_to_json(pre), row_to_json(post);
    END IF;

    IF EXISTS (SELECT 1 FROM public.market_prices WHERE price_per_kg IS DISTINCT FROM fair_price_per_kg) THEN
        RAISE EXCEPTION 'price_per_kg does not equal fair_price_per_kg for some rows.';
    END IF;

    IF (SELECT md5(string_agg((id, crop_name, region, province, fair_price_per_kg, updated_at)::text, E'\n' ORDER BY id)) FROM public.market_prices) <> pre.rows_hash THEN
        RAISE EXCEPTION 'The six original columns changed during the migration (rows_hash mismatch).';
    END IF;

    IF (SELECT count(*) FROM public.market_prices WHERE is_legacy) <> pre.row_count THEN
        RAISE EXCEPTION 'Not every pre-existing row is marked is_legacy.';
    END IF;

    IF (SELECT count(*) FROM migration_backup.market_prices_001) <> pre.row_count
       OR EXISTS (SELECT id, crop_name, region, province, fair_price_per_kg, updated_at
                  FROM migration_backup.market_prices_001
                  EXCEPT
                  SELECT id, crop_name, region, province, fair_price_per_kg, updated_at
                  FROM public.market_prices) THEN
        RAISE EXCEPTION 'Backup does not match the live table.';
    END IF;

    RAISE NOTICE 'Migration 001 checks passed: % rows, price checksum %, id checksum %.',
        post.row_count, post.price_sum, post.id_sum;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- After COMMIT — read-only verification (compare with inspect_market_prices.sql #4, #5)
-- ---------------------------------------------------------------------------
-- SELECT count(*), sum(fair_price_per_kg), sum(price_per_kg), sum(id), max(id) FROM public.market_prices;
-- SELECT is_legacy, count(*), min(price_date), max(price_date) FROM public.market_prices GROUP BY is_legacy;
-- SELECT last_value, is_called FROM public.market_prices_id_seq;   -- unchanged by 001 (426, true at the R8 snapshot)
-- SELECT pre_rows_hash, pre_fair_price_comment FROM migration_backup.migration_001_meta;   -- keep a copy
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.market_prices'::regclass;
