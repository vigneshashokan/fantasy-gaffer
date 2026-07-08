#!/usr/bin/env bash
# e2e/run.sh — one-command local E2E (spec §9).
# Usage: ./e2e/run.sh [e2e/flows/<one>.yaml]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SIM_NAME="${E2E_SIM_NAME:-iPhone 16 Pro}"
FPL_PORT="${E2E_FPL_PORT:-4004}"
ART="e2e/.artifacts"
APP_DIR="$ART/app"
FLOW="${1:-e2e/flows}"

say() { printf '\n[e2e] %s\n' "$*"; }
die() { printf '\n[e2e] FATAL: %s\n' "$*" >&2; exit 1; }

# ---------- preflight ----------
command -v docker >/dev/null || die "docker not found — install Docker Desktop"
docker info >/dev/null 2>&1 || die "docker daemon not running — start Docker Desktop"
command -v maestro >/dev/null || die 'maestro not found — install: curl -Ls "https://get.maestro.mobile.dev" | bash'
command -v supabase >/dev/null || die "supabase CLI not found — brew install supabase/tap/supabase"
command -v node >/dev/null || die "node not found"
command -v jq >/dev/null || die "jq not found — brew install jq"
say "maestro version: $(maestro --version 2>&1 | head -1)"

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
node --test e2e/transform.test.mjs >/dev/null || die "transform self-test failed"
node e2e/transform.mjs
eval "$(node e2e/dataset-info.mjs --sh)"
say "dataset: entry $E2E_ENTRY_ID, live GW $E2E_GW, players: $E2E_PLAYER_NAME / $E2E_GK_NAME"

# ---------- supabase + seed ----------
supabase start
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
[ -n "${API_URL:-}" ] && [ -n "${ANON_KEY:-}" ] && [ -n "${SERVICE_ROLE_KEY:-}" ] \
  || die "could not parse 'supabase status -o env' (CLI format changed?) — inspect its output and adjust the grep above"
SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" node e2e/seed.mjs

# ---------- fixture server + metro ----------
node e2e/fixture-server.mjs >"$ART/fixture-server.log" 2>&1 &
FIX_PID=$!
EXPO_PUBLIC_SUPABASE_URL="$API_URL" \
EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
EXPO_PUBLIC_FPL_BASE_URL="http://127.0.0.1:$FPL_PORT" \
EXPO_PUBLIC_POSTHOG_KEY="" \
EXPO_PUBLIC_SENTRY_DSN="" \
CI=1 npx expo start --port 8081 >"$ART/metro.log" 2>&1 &
METRO_PID=$!
cleanup() { kill "$FIX_PID" "$METRO_PID" 2>/dev/null || true; }
trap cleanup EXIT

for i in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:$FPL_PORT/bootstrap-static/" >/dev/null 2>&1 && break
  [ "$i" = 30 ] && die "fixture server failed to start (see $ART/fixture-server.log)"
  sleep 1
done
for i in $(seq 1 90); do
  curl -fsS "http://127.0.0.1:8081/status" >/dev/null 2>&1 && break
  [ "$i" = 90 ] && die "metro failed to start (see $ART/metro.log)"
  sleep 1
done
say "services up (fixture :$FPL_PORT, metro :8081)"

# ---------- simulator ----------
xcrun simctl bootstatus "$SIM_NAME" -b || die "could not boot simulator '$SIM_NAME' (E2E_SIM_NAME to override)"
open -a Simulator
xcrun simctl install "$SIM_NAME" "$APP_PATH"
say "pre-bundling JS (first compile can take 1-2 min)…"
curl -fsS "http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=ios&dev=true&minify=false" -o /dev/null || true

# ---------- run ----------
say "running maestro: $FLOW"
maestro test \
  -e EMAIL_A="e2e-a@fantasygaffer.test" \
  -e EMAIL_B="e2e-b@fantasygaffer.test" \
  -e PASSWORD="e2e-password-1" \
  -e ENTRY_ID="$E2E_ENTRY_ID" \
  -e PLAYER_NAME="$E2E_PLAYER_NAME" \
  -e GK_NAME="$E2E_GK_NAME" \
  "$FLOW"
say "GREEN — all flows passed"
