-- AgriVoice — Rollback for migration 001
-- STATUS: PROPOSED — for human review. Read 001_rollback_and_recovery.md first.
--
-- Restores public.market_prices to its pre-001 shape:
--   * re-creates UNIQUE (crop_name, region) under its original name
--   * drops uq_market_prices_crop_region_date and the columns 001 added
--   * verifies every legacy row against migration_backup.market_prices_001
--
-- By default this REFUSES to run if rows written after migration 001 exist
-- (is_legacy = false). Those rows are re-downloadable WFP data, but removing
-- them is a separate, explicit decision — see step 1b below.
--
-- Before running: stop the new backend's price sync (PRICE_SYNC_ON_STARTUP=false
-- or stop the service) so it cannot write during or after the rollback.
--
-- Restores the original comment on fair_price_per_kg (saved by 001; NULL if there was none).
-- Does not touch the id sequence (gaps after deleted rows are harmless),
-- RLS policies or grants. The backup schema is kept; drop it manually later.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

LOCK TABLE public.market_prices IN SHARE ROW EXCLUSIVE MODE;

-- ---------------------------------------------------------------------------
-- 0. Preconditions
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('migration_backup.market_prices_001') IS NULL
       OR to_regclass('migration_backup.migration_001_meta') IS NULL THEN
        RAISE EXCEPTION 'Migration 001 backup tables not found; nothing to roll back (or migration never committed).';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'market_prices' AND column_name = 'is_legacy') THEN
        RAISE EXCEPTION 'market_prices has no is_legacy column; it does not look migrated.';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1a. Refuse if post-migration rows exist (default)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    new_rows integer;
BEGIN
    SELECT count(*) INTO new_rows FROM public.market_prices WHERE NOT is_legacy;
    IF new_rows > 0 THEN
        RAISE EXCEPTION '% rows were written after migration 001. Decide on step 1b (archive + remove) before rolling back.', new_rows;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1b. OPTIONAL — only if you decided to remove post-migration rows.
--     To use: delete step 1a above and uncomment this block.
--     Rows are archived to migration_backup first, never just deleted.
-- ---------------------------------------------------------------------------
-- CREATE TABLE migration_backup.market_prices_001_synced_rows AS
-- SELECT * FROM public.market_prices WHERE NOT is_legacy;
--
-- DELETE FROM public.market_prices WHERE NOT is_legacy;

-- ---------------------------------------------------------------------------
-- 2. Legacy rows must be byte-for-byte what was backed up (original columns)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF (SELECT count(*) FROM public.market_prices) <> (SELECT count(*) FROM migration_backup.market_prices_001)
       OR EXISTS (SELECT id, crop_name, region, province, fair_price_per_kg, updated_at FROM migration_backup.market_prices_001
                  EXCEPT
                  SELECT id, crop_name, region, province, fair_price_per_kg, updated_at FROM public.market_prices)
       OR EXISTS (SELECT id, crop_name, region, province, fair_price_per_kg, updated_at FROM public.market_prices
                  EXCEPT
                  SELECT id, crop_name, region, province, fair_price_per_kg, updated_at FROM migration_backup.market_prices_001) THEN
        RAISE EXCEPTION 'Live rows differ from migration_backup.market_prices_001. Use the recovery procedure (R3) instead.';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Restore the original unique constraint (original name), then drop 001's index
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    constraint_name text;
BEGIN
    SELECT dropped_constraint INTO STRICT constraint_name FROM migration_backup.migration_001_meta;
    IF constraint_name IS NULL THEN
        RAISE EXCEPTION 'migration_001_meta has no dropped_constraint recorded.';
    END IF;
    EXECUTE format('ALTER TABLE public.market_prices ADD CONSTRAINT %I UNIQUE (crop_name, region)', constraint_name);
END $$;

DROP INDEX public.uq_market_prices_crop_region_date;

-- ---------------------------------------------------------------------------
-- 4. Drop the columns 001 added (their values are reproducible from the backup)
-- ---------------------------------------------------------------------------
ALTER TABLE public.market_prices
    DROP COLUMN price_per_kg,
    DROP COLUMN price_date,
    DROP COLUMN unit,
    DROP COLUMN source,
    DROP COLUMN created_at,
    DROP COLUMN is_legacy;

-- Put back the comment 001 replaced (format %L turns a NULL into "IS NULL", which removes it)
DO $$
BEGIN
    EXECUTE format('COMMENT ON COLUMN public.market_prices.fair_price_per_kg IS %L',
                   (SELECT pre_fair_price_comment FROM migration_backup.migration_001_meta));
END $$;

-- ---------------------------------------------------------------------------
-- 5. Post-checks against the checksums recorded by migration 001
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    meta record;
    post record;
BEGIN
    SELECT * INTO meta FROM migration_backup.migration_001_meta;
    SELECT count(*) AS row_count, sum(fair_price_per_kg) AS price_sum, sum(id) AS id_sum
    INTO post FROM public.market_prices;

    IF post.row_count <> meta.pre_row_count OR post.price_sum <> meta.pre_price_sum OR post.id_sum <> meta.pre_id_sum THEN
        RAISE EXCEPTION 'Rollback checksum mismatch. expected=(%, %, %) actual=%',
            meta.pre_row_count, meta.pre_price_sum, meta.pre_id_sum, row_to_json(post);
    END IF;

    IF (SELECT md5(string_agg((id, crop_name, region, province, fair_price_per_kg, updated_at)::text, E'\n' ORDER BY id))
        FROM public.market_prices) <> meta.pre_rows_hash THEN
        RAISE EXCEPTION 'Rollback rows_hash mismatch: the original columns differ from before migration 001.';
    END IF;

    IF col_description('public.market_prices'::regclass,
                       (SELECT attnum FROM pg_attribute
                        WHERE attrelid = 'public.market_prices'::regclass AND attname = 'fair_price_per_kg'))
       IS DISTINCT FROM meta.pre_fair_price_comment THEN
        RAISE EXCEPTION 'The comment on fair_price_per_kg was not restored.';
    END IF;

    RAISE NOTICE 'Rollback checks passed: % rows, price checksum %.', post.row_count, post.price_sum;
END $$;

COMMIT;

-- Afterwards (read-only): re-run inspect_market_prices.sql #1, #2, #4 and compare
-- with the values recorded before migration 001.
-- Keep migration_backup until you are satisfied; then, manually:
--   DROP SCHEMA migration_backup CASCADE;
