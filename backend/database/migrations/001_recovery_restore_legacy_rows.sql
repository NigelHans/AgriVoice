-- AgriVoice — Recovery R3 for migration 001 (PROPOSED — for human review)
-- Use when migration 001 is applied and some of the 51 pre-existing (legacy)
-- rows were changed or deleted afterwards (e.g. through the public ALL policy).
--
-- Restores every legacy row from migration_backup.market_prices_001 using its
-- ORIGINAL id. Rows written by the new sync (is_legacy = false) are not touched.
-- Run the preview queries first; the restore runs in one transaction.

-- ---------------------------------------------------------------------------
-- Preview (read-only): which legacy rows differ from the backup or are missing
-- ---------------------------------------------------------------------------
SELECT 'changed' AS problem, b.id, b.crop_name, b.region,
       b.fair_price_per_kg AS backup_price, m.fair_price_per_kg AS live_price
FROM migration_backup.market_prices_001 b
JOIN public.market_prices m ON m.id = b.id
WHERE (m.crop_name, m.region, m.province, m.fair_price_per_kg, m.updated_at)
      IS DISTINCT FROM (b.crop_name, b.region, b.province, b.fair_price_per_kg, b.updated_at)
UNION ALL
SELECT 'missing', b.id, b.crop_name, b.region, b.fair_price_per_kg, NULL
FROM migration_backup.market_prices_001 b
WHERE NOT EXISTS (SELECT 1 FROM public.market_prices m WHERE m.id = b.id)
ORDER BY id;

-- ---------------------------------------------------------------------------
-- Restore
-- ---------------------------------------------------------------------------
BEGIN;

SET LOCAL lock_timeout = '5s';
LOCK TABLE public.market_prices IN SHARE ROW EXCLUSIVE MODE;

-- Changed legacy rows → backup values (and the derived 001 columns)
UPDATE public.market_prices m
SET crop_name         = b.crop_name,
    region            = b.region,
    province          = b.province,
    fair_price_per_kg = b.fair_price_per_kg,
    updated_at        = b.updated_at,
    price_per_kg      = b.fair_price_per_kg,
    price_date        = (b.updated_at AT TIME ZONE 'Asia/Manila')::date,
    unit              = 'kg',
    source            = 'legacy sync (report date unknown)',
    created_at        = b.updated_at,
    is_legacy         = true
FROM migration_backup.market_prices_001 b
WHERE m.id = b.id
  AND (m.crop_name, m.region, m.province, m.fair_price_per_kg, m.updated_at, m.is_legacy)
      IS DISTINCT FROM (b.crop_name, b.region, b.province, b.fair_price_per_kg, b.updated_at, true);

-- Deleted legacy rows → re-inserted with their original ids (sequence untouched)
INSERT INTO public.market_prices
    (id, crop_name, region, province, fair_price_per_kg, updated_at,
     price_per_kg, price_date, unit, source, created_at, is_legacy)
SELECT b.id, b.crop_name, b.region, b.province, b.fair_price_per_kg, b.updated_at,
       b.fair_price_per_kg, (b.updated_at AT TIME ZONE 'Asia/Manila')::date, 'kg',
       'legacy sync (report date unknown)', b.updated_at, true
FROM migration_backup.market_prices_001 b
WHERE NOT EXISTS (SELECT 1 FROM public.market_prices m WHERE m.id = b.id);

-- Verify: every backed-up row is present and identical
DO $$
DECLARE
    meta record;
    restored record;
BEGIN
    SELECT * INTO meta FROM migration_backup.migration_001_meta;
    SELECT count(*) AS row_count, sum(m.fair_price_per_kg) AS price_sum, sum(m.id) AS id_sum
    INTO restored
    FROM public.market_prices m
    JOIN migration_backup.market_prices_001 b
      ON b.id = m.id
     AND (m.crop_name, m.region, m.province, m.fair_price_per_kg, m.updated_at)
         IS NOT DISTINCT FROM (b.crop_name, b.region, b.province, b.fair_price_per_kg, b.updated_at)
    WHERE m.is_legacy;

    IF restored.row_count <> meta.pre_row_count OR restored.price_sum <> meta.pre_price_sum
       OR restored.id_sum <> meta.pre_id_sum THEN
        RAISE EXCEPTION 'Recovery verification failed: expected (%, %, %) got %',
            meta.pre_row_count, meta.pre_price_sum, meta.pre_id_sum, row_to_json(restored);
    END IF;

    -- Same fingerprint as before migration 001, over the legacy rows' original columns
    IF (SELECT md5(string_agg((id, crop_name, region, province, fair_price_per_kg, updated_at)::text, E'\n' ORDER BY id))
        FROM public.market_prices WHERE is_legacy) <> meta.pre_rows_hash THEN
        RAISE EXCEPTION 'Recovery rows_hash mismatch: legacy rows still differ from the backup.';
    END IF;
    RAISE NOTICE 'Recovery checks passed: % legacy rows restored/verified, price checksum %.',
        restored.row_count, restored.price_sum;
END $$;

COMMIT;
