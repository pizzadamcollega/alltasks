#!/usr/bin/env bash
# Runs the schema + smoke tests on a throwaway database of a plain local Postgres.
# Usage: supabase/tests/run-local.sh [database-name]   (needs createdb/psql on PATH)
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${1:-pizzadam_test}"
dropdb --if-exists "$DB"
createdb "$DB"
psql -q -d "$DB" -v ON_ERROR_STOP=1 \
  -f supabase/tests/local_supabase_stub.sql \
  -f supabase/migrations/20261025000001_init.sql \
  -f supabase/seed.sql > /dev/null
psql -q -At -d "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/smoke.sql | tail -1
