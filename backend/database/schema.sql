-- AgriVoice — Supabase Schema
-- Run this SQL in your Supabase SQL Editor to set up all tables.

-- ============================================================
-- TABLE: market_prices
-- Stores daily crop prices synced from DA/BAI public data.
-- ============================================================
CREATE TABLE IF NOT EXISTS market_prices (
    id            BIGSERIAL PRIMARY KEY,
    crop_name     TEXT NOT NULL,           -- e.g. "Palay (Special)", "White Corn"
    region        TEXT NOT NULL,           -- e.g. "Region X", "Davao Region"
    province      TEXT,
    municipality  TEXT,
    price_per_kg  NUMERIC(10, 2) NOT NULL, -- prevailing farmgate price
    unit          TEXT DEFAULT 'kg',
    price_date    DATE NOT NULL,
    source        TEXT DEFAULT 'DA-AMAD',  -- data source
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast daily lookups
CREATE INDEX IF NOT EXISTS idx_market_prices_date  ON market_prices (price_date);
CREATE INDEX IF NOT EXISTS idx_market_prices_crop  ON market_prices (crop_name);
CREATE INDEX IF NOT EXISTS idx_market_prices_region ON market_prices (region);

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
