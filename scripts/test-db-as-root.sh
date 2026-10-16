#!/usr/bin/env bash
# For containers where you are root: copies the repo somewhere the postgres
# user can read and runs scripts/test-db.sh as that user.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -r "$ROOT/supabase" "$ROOT/scripts" "$TMP/"
chown -R postgres "$TMP"
su postgres -c "$TMP/scripts/test-db.sh"
