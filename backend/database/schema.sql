-- AgriVoice — Supabase Schema
-- Run this SQL in your Supabase SQL Editor to set up all tables in a NEW project.
-- Existing projects: do not run this against an existing market_prices table;
-- use database/migrations/ instead.

-- New tables in public get no anon/authenticated access by default (same as migration 003);
-- each table below grants what the app needs explicitly. The backend uses service_role.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- ============================================================
-- TABLE: market_prices
-- Stores monthly crop prices synced from UN-WFP public data.
-- ============================================================
CREATE TABLE IF NOT EXISTS market_prices (
    id                 BIGSERIAL PRIMARY KEY,
    crop_name          TEXT NOT NULL,            -- e.g. "Onion", "Tomato", "Rice"
    region             TEXT NOT NULL,            -- e.g. "Region X", "National Capital region"
    province           TEXT,
    municipality       TEXT,
    price_per_kg       NUMERIC(10, 2) NOT NULL,  -- recorded market price
    fair_price_per_kg  NUMERIC,                  -- legacy mirror of price_per_kg (written by the sync)
    unit               TEXT DEFAULT 'kg',
    price_date         DATE NOT NULL,            -- source report date
    source             TEXT DEFAULT 'DA-AMAD',   -- data source
    is_legacy          BOOLEAN NOT NULL DEFAULT false, -- true: price_date is a sync date, not a report date
    updated_at         TIMESTAMPTZ,              -- when the row was last synced
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast daily lookups
CREATE INDEX IF NOT EXISTS idx_market_prices_date  ON market_prices (price_date);
CREATE INDEX IF NOT EXISTS idx_market_prices_crop  ON market_prices (crop_name);
CREATE INDEX IF NOT EXISTS idx_market_prices_region ON market_prices (region);

-- One price per crop/region/date; the price sync upserts on these columns.
-- Existing databases: see migrations/001_market_prices_standardize.sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_market_prices_crop_region_date
    ON market_prices (crop_name, region, price_date);

-- Read-only for the public API key (same end state as migration 002); only service_role writes
ALTER TABLE market_prices ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON market_prices TO anon, authenticated;
DROP POLICY IF EXISTS "Allow public read access on prices" ON market_prices;
CREATE POLICY "Allow public read access on prices" ON market_prices FOR SELECT TO public USING (true);

-- ============================================================
-- TABLE: conversations
-- Stores farmer conversation history for context continuity.
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id     TEXT NOT NULL,           -- anonymous device identifier
    language      TEXT DEFAULT 'fil',
    location      TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_device ON conversations (device_id);

-- ============================================================
-- TABLE: messages
-- Individual turns in a conversation.
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT NOT NULL,
    audio_url       TEXT,                  -- optional: Supabase Storage URL of the recording
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id);

-- ============================================================
-- TABLE: crops_reference
-- Static reference table for crop information.
-- ============================================================
CREATE TABLE IF NOT EXISTS crops_reference (
    id              BIGSERIAL PRIMARY KEY,
    crop_name_en    TEXT NOT NULL,
    crop_name_fil   TEXT,
    crop_name_ceb   TEXT,
    crop_name_ilo   TEXT,
    category        TEXT,                  -- e.g. "Rice", "Corn", "Vegetables", "Fruits"
    planting_months TEXT[],               -- e.g. ARRAY['June','July','November']
    harvest_months  TEXT[],
    notes           TEXT
);

-- ============================================================
-- SEED: Sample crops reference data
-- ============================================================
INSERT INTO crops_reference (crop_name_en, crop_name_fil, crop_name_ceb, category, planting_months, harvest_months)
VALUES
    ('Rice (Palay)',    'Palay',    'Humay',    'Cereals',    ARRAY['June','July','November','December'], ARRAY['September','October','March','April']),
    ('White Corn',      'Mais',     'Mais',     'Cereals',    ARRAY['May','June','October','November'],    ARRAY['August','September','January','February']),
    ('Onion',           'Sibuyas',  'Sibuyas',  'Vegetables', ARRAY['October','November'],                ARRAY['January','February','March']),
    ('Tomato',          'Kamatis',  'Kamatis',  'Vegetables', ARRAY['July','August','September'],         ARRAY['October','November','December']),
    ('Banana',          'Saging',   'Saging',   'Fruits',     ARRAY['Year-round'],                        ARRAY['Year-round'])
ON CONFLICT DO NOTHING;

-- The remaining tables are backend-only (service_role bypasses RLS): RLS on, no policies, no grants
ALTER TABLE conversations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE crops_reference ENABLE ROW LEVEL SECURITY;
