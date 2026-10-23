#!/usr/bin/env bash
# Applies the migrations to a throwaway local Postgres (with a small stand-in
# for Supabase's auth schema) and runs the security tests.
#
# Needs Postgres 15+ binaries on PATH or in PG_BIN.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
DATA="$(mktemp -d)"
PORT="${PGTEST_PORT:-54329}"

cleanup() {
  "$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$DATA"
}
trap cleanup EXIT

if [ "$(id -u)" = "0" ]; then
  echo "Run this as a normal user (Postgres refuses to run as root)." >&2
  echo "e.g. sudo -u postgres $0" >&2
  exit 1
fi

"$PG_BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -w start >/dev/null

PSQL=("$PG_BIN/psql" -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -f "$ROOT/supabase/tests/auth_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f "$ROOT/supabase/tests/security_test.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/features_test.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/client_page_test.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/today_grow_test.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/job_sheet_test.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/small_features_test.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/client_messages_test.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/signup_alert_test.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/shutoffs_test.sql"
"${PSQL[@]}" -v email=a@example.com -f "$ROOT/supabase/dev-seed.sql" >/dev/null
echo "Dev seed applies cleanly."
