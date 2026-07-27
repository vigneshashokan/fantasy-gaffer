#!/usr/bin/env bash
# e2e/dev.sh — bring up the hermetic E2E stack and HOLD it for hands-on use,
# instead of driving it with Maestro like run.sh does.
#
# Why this exists: FPL 404s /entry/{id}/event/{gw}/picks/ until a gameweek's
# deadline has passed, so between seasons there is no squad to read and the
# pitch cannot render at all (useApexTeam surfaces `noSquad`). Anything that
# needs a populated pitch — #91's visual bugs, the #47 Inspector pass on
# Team/Transfer, store screenshots — is therefore blocked on the real GW1
# deadline. Pointing the app at the committed fixture capture unblocks that
# work now.
#
# Usage:
#   ./e2e/dev.sh                                  # iPhone 16 Pro
#   E2E_SIM_NAME="iPhone SE (3rd generation)" ./e2e/dev.sh   # narrowest sim
#   E2E_METRO_PORT=8082 ./e2e/dev.sh              # run beside another dev server
#
# Ctrl-C tears down Metro and the fixture server. Supabase is deliberately left
# running (it is slow to start and harmless idle) — `supabase stop` when done.
#
# NOTE: the service setup below is duplicated from run.sh rather than factored
# into a shared file. That is deliberate: run.sh is the load-bearing suite that
# #152 will wire into CI, and the duplication is cheaper than the risk of
# refactoring it. Keep the two in sync by hand if the stack changes.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SIM_NAME="${E2E_SIM_NAME:-iPhone 16 Pro}"
FPL_PORT="${E2E_FPL_PORT:-4004}"
METRO_PORT="${E2E_METRO_PORT:-8081}"
BUNDLE_ID="com.fantasygaffer.app"
ART="e2e/.artifacts"
APP_DIR="$ART/app"

say() { printf '\n[dev] %s\n' "$*"; }
die() { printf '\n[dev] FATAL: %s\n' "$*" >&2; exit 1; }

# ---------- preflight ----------
command -v docker >/dev/null || die "docker not found — install Docker Desktop"
docker info >/dev/null 2>&1 || die "docker daemon not running — start Docker Desktop"
command -v supabase >/dev/null || die "supabase CLI not found — brew install supabase/tap/supabase"
command -v node >/dev/null || die "node not found"
command -v jq >/dev/null || die "jq not found — brew install jq"

# ---------- app artifact ----------
APP_PATH="${E2E_APP_PATH:-$(find "$APP_DIR" -maxdepth 3 -name '*.app' -print -quit 2>/dev/null || true)}"
if [ -z "$APP_PATH" ]; then
  say "no cached app — downloading latest development-simulator build from EAS"
  command -v eas >/dev/null || die "eas CLI needed once for the download — npm i -g eas-cli"
  URL=$(eas build:list --platform ios --profile development-simulator --status finished --limit 1 --json --non-interactive | jq -r '.[0].artifacts.buildUrl')
  [ -n "$URL" ] && [ "$URL" != "null" ] || die "no finished development-simulator build on EAS — run: eas build --profile development-simulator --platform ios"
  mkdir -p "$APP_DIR"
  curl -fsSL "$URL" -o "$ART/app.tar.gz"
  tar -xzf "$ART/app.tar.gz" -C "$APP_DIR"
  APP_PATH=$(find "$APP_DIR" -maxdepth 3 -name '*.app' -print -quit)
fi
[ -n "$APP_PATH" ] || die "could not resolve a .app artifact"
say "app artifact: $APP_PATH"

# ---------- dataset ----------
node e2e/transform.mjs
DATASET_ENV="$(node e2e/dataset-info.mjs --sh)" || die "dataset-info failed"
eval "$DATASET_ENV"
say "dataset: entry $E2E_ENTRY_ID, live GW $E2E_GW, players: $E2E_PLAYER_NAME / $E2E_GK_NAME"

# ---------- supabase + seed ----------
# Supabase's ports collide as readily as Metro's, and `supabase start` only
# discovers it ~40s in, after bringing containers up and tearing them back down.
# Check first. A FOREIGN project's stack is never ours to stop — name it and let
# the operator decide, same rule as the Metro/fixture port preflight below.
DB_HOLDER="$(docker ps --filter 'publish=54322' --format '{{.Names}}' 2>/dev/null | head -1 || true)"
if [ -n "$DB_HOLDER" ] && [ "$DB_HOLDER" != "supabase_db_fantasy-gaffer" ]; then
  die "port 54322 is held by another project's Supabase stack: $DB_HOLDER
       If that project is idle, stop it with:
         supabase stop --project-id ${DB_HOLDER#supabase_db_}
       Confirm it is idle first — it belongs to another project, not this one."
fi

# Seeds players/clubs/fixtures from the SAME bootstrap capture the fixture
# server serves. That pairing is load-bearing: FPL element ids reset every
# season, so serving 2025/26 picks against a 2026/27 players table would join
# each pick to a completely different footballer.
supabase start
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
[ -n "${API_URL:-}" ] && [ -n "${ANON_KEY:-}" ] && [ -n "${SERVICE_ROLE_KEY:-}" ] \
  || die "could not parse 'supabase status -o env' (CLI format changed?)"
SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" node e2e/seed.mjs

# ---------- ports ----------
# Loud failure, never a sweep: non-interactive `expo start` SKIPS a taken port
# while the health check still passes against the foreign server, which once
# served another project's bundle into this app.
for port in "$FPL_PORT" "$METRO_PORT"; do
  HOLDER="$(lsof -ti tcp:"$port" 2>/dev/null | head -1 || true)"
  [ -z "$HOLDER" ] || die "port $port in use by: $(ps -o command= -p "$HOLDER" | head -1) (pid $HOLDER) — stop it, or set E2E_METRO_PORT/E2E_FPL_PORT"
done

# ---------- services ----------
node e2e/fixture-server.mjs >"$ART/fixture-server.log" 2>&1 &
FIX_PID=$!
# EXPO_NO_DOTENV=1 keeps the real PostHog key / Sentry DSN out of the run. An
# empty STRING key does NOT work — PostHog's constructor console.errors, which
# in a dev bundle is a full-screen LogBox over the whole app.
EXPO_PUBLIC_SUPABASE_URL="$API_URL" \
EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
EXPO_PUBLIC_FPL_BASE_URL="http://127.0.0.1:$FPL_PORT" \
EXPO_NO_DOTENV=1 \
CI=1 npx expo start --port "$METRO_PORT" >"$ART/metro.log" 2>&1 &
METRO_PID=$!

# `expo start` forks a Metro child that outlives the npx wrapper — kill the
# descendant TREE. Never kill-by-port: that once took out an unrelated
# project's dev server.
kill_tree() {
  local pid=$1 child
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
  kill "$pid" 2>/dev/null || true
}
cleanup() {
  say "stopping metro + fixture server (supabase left running — 'supabase stop' when done)"
  kill_tree "$METRO_PID"
  kill_tree "$FIX_PID"
}
trap cleanup EXIT

for i in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:$FPL_PORT/bootstrap-static/" >/dev/null 2>&1 && break
  [ "$i" = 30 ] && die "fixture server failed to start (see $ART/fixture-server.log)"
  sleep 1
done
for i in $(seq 1 90); do
  curl -fsS "http://127.0.0.1:$METRO_PORT/status" >/dev/null 2>&1 && break
  [ "$i" = 90 ] && die "metro failed to start (see $ART/metro.log)"
  sleep 1
done
say "services up (fixture :$FPL_PORT, metro :$METRO_PORT)"

# ---------- simulator ----------
xcrun simctl bootstatus "$SIM_NAME" -b || die "could not boot simulator '$SIM_NAME' (E2E_SIM_NAME to override)"
open -a Simulator
xcrun simctl install "$SIM_NAME" "$APP_PATH"
say "pre-bundling JS (first compile can take 1-2 min)…"
curl -fsS "http://127.0.0.1:$METRO_PORT/node_modules/expo-router/entry.bundle?platform=ios&dev=true&minify=false" -o /dev/null || true
xcrun simctl launch "$SIM_NAME" "$BUNDLE_ID" >/dev/null

cat <<EOF

[dev] ────────────────────────────────────────────────────────────
[dev]  Simulator : $SIM_NAME
[dev]  Sign in   : e2e-a@fantasygaffer.test / e2e-password-1
[dev]              (team $E2E_ENTRY_ID already connected — squad renders)
[dev]              e2e-b@fantasygaffer.test has NO team, for empty states
[dev]  Data      : fixture capture, GW $E2E_GW — NOT live FPL
[dev]  Logs      : $ART/metro.log · $ART/fixture-server.log
[dev] ────────────────────────────────────────────────────────────
[dev]  Editing src/ hot-reloads as usual. Ctrl-C to stop.

EOF

wait "$METRO_PID"
