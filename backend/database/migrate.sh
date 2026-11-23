#!/usr/bin/env bash
# Applies migrations 001 and 002 to the live Supabase database, step by step.
# Usage:  cd backend/database && ./migrate.sh
# It asks before every change, saves all output under migration-logs/, and
# stops at the first error. Each migration is one transaction: an error changes nothing.
set -euo pipefail
cd "$(dirname "$0")"

command -v psql >/dev/null || { echo "psql is not installed. Ubuntu: sudo apt install postgresql-client"; exit 1; }

if [ -z "${DB_URL:-}" ]; then
  echo "Paste the database connection string."
  echo "(Supabase dashboard -> Connect -> 'Direct connection' or 'Session pooler' URI, with your DB password filled in)"
  read -rsp "DB_URL: " DB_URL; echo
fi

LOG="migration-logs/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$LOG"
q()   { psql "$DB_URL" -X -q -P pager=off -v ON_ERROR_STOP=1 "$@"; }
ask() { read -rp "$1 Type yes to continue: " a; [ "$a" = yes ] || { echo "Stopped. Nothing else was changed."; exit 1; }; }
inspect() {
  q -f inspect_market_prices.sql > "$LOG/$1-inspect.txt"
  # section A of the 002 checks file is read-only (A..B header lines)
  sed -n '/^-- A\. READ-ONLY/,/^-- B\. READ-ONLY/p' migrations/002_market_prices_restrict_public_writes_checks.sql \
    | q > "$LOG/$1-security.txt"
  echo "  saved $LOG/$1-inspect.txt and $LOG/$1-security.txt"
}

echo "== Step 0: connection test"
q -c "select current_user, version();" -t || { echo "Could not connect. Check the password/URI."; exit 1; }

has_001=$(q -tAc "select count(*) from information_schema.columns where table_schema='public' and table_name='market_prices' and column_name='is_legacy'")
has_002=$(q -tAc "select count(*) = 0 from pg_policies where schemaname='public' and tablename='market_prices' and policyname='Allow full service access on prices'")
echo "  migration 001 applied already: $([ "$has_001" = 1 ] && echo yes || echo no)"
echo "  migration 002 applied already: $([ "$has_002" = t ] && echo yes || echo no)"

echo "== Step 1: read-only inspection (before)"
inspect before

if [ "$has_001" != 1 ]; then
  echo
  echo "== Step 2: migration 001 (adds price_date/source/is_legacy columns, monthly unique key)"
  echo "  IMPORTANT: stop every other running AgriVoice backend first (teammates too),"
  echo "  or 001 will refuse to run because the table changed."
  ask "Run 001 now?"
  q -f migrations/001_market_prices_standardize.sql 2>&1 | tee "$LOG/001-output.txt"
  inspect after-001
  echo "  Differences (expect new columns/index and a swapped unique constraint; row counts/checksums unchanged):"
  diff "$LOG/before-inspect.txt" "$LOG/after-001-inspect.txt" || true
fi

if [ "$has_002" != t ]; then
  echo
  echo "== Step 3: migration 002 (public API key becomes read-only; backend keeps writing with service_role)"
  ask "Run 002 now?"
  q -f migrations/002_market_prices_restrict_public_writes.sql 2>&1 | tee "$LOG/002-output.txt"
  inspect after-002
  echo "  Expect: only the 'Allow public read access on prices' policy; anon/authenticated have SELECT only."
  diff "$LOG/before-security.txt" "$LOG/after-002-security.txt" || true
fi

echo
echo "== Step 4: backend key check"
key=$(grep -E '^SUPABASE_KEY=' ../.env 2>/dev/null | cut -d= -f2- | tr -d '"'"'" || true)
case "$key" in
  sb_secret_*) echo "  OK: backend/.env uses a secret (service_role) key." ;;
  sb_publishable_*) echo "  PROBLEM: backend/.env uses the publishable key. Replace it with the secret key." ;;
  eyJ*) seg=$(echo "$key" | cut -d. -f2 | tr '_-' '/+')
        while [ $(( ${#seg} % 4 )) -ne 0 ]; do seg="$seg="; done
        role=$(echo "$seg" | base64 -d 2>/dev/null | grep -o '"role":"[^"]*"' || true)
        [ "$role" = '"role":"service_role"' ] && echo "  OK: backend/.env uses the service_role key." \
          || echo "  PROBLEM: backend/.env key is $role, not service_role. The price sync will get 'permission denied'." ;;
  *) echo "  Could not read SUPABASE_KEY from backend/.env; make sure it is the service_role/secret key." ;;
esac

echo
echo "Done. Logs: backend/database/$LOG"
echo "Next: start the backend (cd backend && python run.py). Its log should say 'Price sync complete: <n> rows upserted'."
