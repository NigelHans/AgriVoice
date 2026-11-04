-- AgriVoice — READ-ONLY inspection of public.market_prices.
-- Run in the Supabase SQL Editor before (and after) migration 001.
-- Nothing in this file modifies data, schema, grants or policies.

-- 1. Columns, types, defaults
SELECT column_name, data_type, is_nullable, column_default, is_identity
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'market_prices'
ORDER BY ordinal_position;

-- 2. Constraints (expect PRIMARY KEY (id) and UNIQUE (crop_name, region) before migration 001)
SELECT conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.market_prices'::regclass;

-- 3. Indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'market_prices';

-- 4. Row count and checksums (save these; migration 001 must preserve them)
SELECT count(*)               AS total_rows,
       sum(fair_price_per_kg) AS fair_price_checksum,
       sum(id)                AS id_checksum,
       max(id)                AS max_id
FROM public.market_prices;

-- 5. ID sequence state (migration 001 does not touch it)
SELECT last_value, is_called FROM public.market_prices_id_seq;

-- 6. Prices that NUMERIC(10,2) would round, and value range
SELECT count(*) FILTER (WHERE fair_price_per_kg <> round(fair_price_per_kg, 2)) AS would_round,
       min(fair_price_per_kg) AS min_price,
       max(fair_price_per_kg) AS max_price
FROM public.market_prices;

-- 7. Duplicates the new unique index (crop_name, region, price_date) would hit,
--    computed the same way migration 001 derives price_date
SELECT crop_name, region, (updated_at AT TIME ZONE 'Asia/Manila')::date AS price_date, count(*)
FROM public.market_prices
GROUP BY 1, 2, 3
HAVING count(*) > 1;

-- 8. Exact region and crop spellings (the unique index is case-sensitive; the
--    WFP sync writes e.g. 'National Capital region', 'Region IV-A')
SELECT DISTINCT region FROM public.market_prices ORDER BY region;
SELECT DISTINCT crop_name FROM public.market_prices ORDER BY crop_name;

-- 9. Row-level security, policies (including their conditions) and table grants
SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'public.market_prices'::regclass;

SELECT policyname, permissive, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'market_prices';

SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'market_prices'
GROUP BY grantee
ORDER BY grantee;

-- 10. User-defined triggers
SELECT tgname, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'public.market_prices'::regclass AND NOT tgisinternal;

-- 11. After migration 001 only: legacy vs. verified rows
-- SELECT is_legacy, count(*), min(price_date), max(price_date)
-- FROM public.market_prices GROUP BY is_legacy;
