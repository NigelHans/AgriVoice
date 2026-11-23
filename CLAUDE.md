# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

AgriVoice is a voice assistant for Filipino farmers. It has an Expo React Native app (`mobile/`), a FastAPI backend (`backend/`) and a Supabase Postgres database. The backend uses Groq for speech-to-text (Whisper) and for the LLM.

## Commands

Backend (run from `backend/`; `pytest.ini` sets `pythonpath = .`):

```bash
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
python -m pytest                                   # all tests
python -m pytest tests/test_chat.py::test_name     # single test
python scraper.py                                  # manual WFP price sync into Supabase
```

Set `PRICE_SYNC_ON_STARTUP=false` in `backend/.env` to stop the server from writing to Supabase when it starts.

Mobile (run from `mobile/`): `npm install`, then `npx expo start`. Set `EXPO_PUBLIC_BACKEND_URL` in `mobile/.env` to the dev machine's LAN IP. Without it the app falls back to `localhost:8000`.

CI (`.github/workflows/ci.yml`) runs the backend pytest suite, plus `tsc --noEmit` and an Android `expo export` bundle for the mobile app.

## Backend architecture

- `app/main.py` mounts the routers under `/api/v1/{voice,chat,market,weather}`. On startup it launches `run_price_sync` in a background thread, so the server accepts requests right away.
- Layering: `api/v1/*` routes → `services/*` → `core/` clients (`groq_client`, `supabase_client`, which are lazy singletons). Request and response models live in `schemas/`.
- Errors: when Groq, Supabase or Open-Meteo fails, the service raises `core.errors.ExternalServiceError(service, detail)`, and a handler in `main.py` turns it into an HTTP 502. Raise this error rather than a bare exception. If Supabase credentials are missing, the backend also returns a 502.
- Chat pipeline (`services/chat_service.py`): a small extraction model (`GROQ_EXTRACTION_MODEL`) parses the message into intent, crop and quantity. For negotiation or price intents it looks up the latest `market_prices` row and puts those facts into the prompt for the main LLM (`GROQ_LLM_MODEL`). The voice endpoint transcribes the audio first, then runs the same pipeline.
- Price sync (`services/price_sync.py`) downloads the UN-WFP HDX CSV for the Philippines. For each crop, region and month it takes the median retail PHP/KG price and upserts it on `crop_name,region,price_date`. That key must match the unique index in the DB. The sync writes each price to both `price_per_kg` and the legacy NOT NULL `fair_price_per_kg` until a migration drops the legacy column.
- Tests (`tests/conftest.py`) replace Groq, Supabase and Open-Meteo with fakes (`FakeSupabase`, `FakeGroq`, …), so they need no credentials or network access. `FakeSupabase` supports only the `market_prices` table.

## Database and migrations

- `backend/database/schema.sql` is the intended schema. `inspect_market_prices.sql` holds read-only inspection queries.
- Migrations in `backend/database/migrations/` are applied **by hand** by the user, either in the Supabase SQL Editor or with `backend/database/migrate.sh` (psql; it asks before each change and logs to `migration-logs/`). Each script runs in a single transaction and aborts if any check fails. Each migration comes with a rollback script, a recovery script or a read-only `*_checks.sql`. `001_rollback_and_recovery.md` gives the rollout order: inspect, migrate, re-inspect, then deploy the backend.
- Migrations 001 and 002 are applied on the live project (verified 2026-11-23: 714 rows). 002 makes `market_prices` read-only for the `anon` and `authenticated` roles. The backend writes with the service_role key.
- Migration 003 (proposed until the user runs it) revokes the Supabase default privileges that gave `anon`/`authenticated` full access to tables and sequences created later in `public`. A new table the app reads with the public key needs its own RLS, `GRANT SELECT` and policy (see the header of `003_restrict_default_privileges.sql`).
- Database audits and migration reviews are **read-only**: never connect to the live database or run migrations. Write and review the SQL, and the user applies it.

## Mobile

`src/App.tsx` sets up bottom-tab navigation across the Voice, Market, Weather, History and Settings screens. All HTTP calls go through `src/services/api.ts` (axios). `LanguageContext` stores the selected language (`fil`, `ceb`, `ilo` or `en`). Chat history is saved on the device with AsyncStorage.
