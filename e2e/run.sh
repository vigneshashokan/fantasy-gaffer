#!/usr/bin/env bash
# e2e/run.sh — one-command local E2E (spec §9).
# Usage: ./e2e/run.sh [e2e/flows/<one>.yaml]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SIM_NAME="${E2E_SIM_NAME:-iPhone 16 Pro}"
FPL_PORT="${E2E_FPL_PORT:-4004}"
METRO_PORT="${E2E_METRO_PORT:-8081}"
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
DATASET_ENV="$(node e2e/dataset-info.mjs --sh)" || die "dataset-info failed — is the transformed dataset present? (node e2e/transform.mjs)"
[ -n "$DATASET_ENV" ] || die "dataset-info produced no output"
eval "$DATASET_ENV"
say "dataset: entry $E2E_ENTRY_ID, live GW $E2E_GW, players: $E2E_PLAYER_NAME / $E2E_GK_NAME"

# ---------- supabase + seed ----------
supabase start
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
[ -n "${API_URL:-}" ] && [ -n "${ANON_KEY:-}" ] && [ -n "${SERVICE_ROLE_KEY:-}" ] \
  || die "could not parse 'supabase status -o env' (CLI format changed?) — inspect its output and adjust the grep above"
SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" node e2e/seed.mjs

# ---------- fixture server + metro ----------
# Fail LOUDLY if either port is already held. This is not pedantry: `npx expo
# start` in non-interactive (CI=1) mode responds to a taken port by SKIPPING the
# dev server ("Use port X instead?" needs input), while the :$METRO_PORT health
# check below happily passes against the FOREIGN Metro — the observed result was
# the dev client loading another project's bundle mid-suite (a pawtio-app RedBox
# inside the Fantasy Gaffer app). Another dev server on 8081 is normal life on a
# dev machine — point the suite elsewhere with E2E_METRO_PORT instead.
for port in "$FPL_PORT" "$METRO_PORT"; do
  HOLDER="$(lsof -ti tcp:"$port" 2>/dev/null | head -1 || true)"
  [ -z "$HOLDER" ] || die "port $port is already in use by: $(ps -o command= -p "$HOLDER" | head -1) (pid $HOLDER) — stop it, or set E2E_METRO_PORT/E2E_FPL_PORT to run the suite beside it"
done
node e2e/fixture-server.mjs >"$ART/fixture-server.log" 2>&1 &
FIX_PID=$!
# EXPO_NO_DOTENV=1 skips loading .env entirely, so the developer's REAL PostHog
# key / Sentry DSN never enter the run (hermeticity), and analytics config
# resolves to `undefined` — the app's designed disabled-no-op path
# (`new PostHog(KEY ?? 'phc_disabled', { disabled: !KEY })`). Passing the keys as
# empty STRING instead (the earlier approach) made PostHog receive "" — which its
# constructor rejects with a console.error, and in the dev bundle that surfaces
# as a full-screen LogBox that blocks every flow's first tap. Supabase + FPL vars
# are supplied inline below, so nothing the app needs is lost by skipping .env.
EXPO_PUBLIC_SUPABASE_URL="$API_URL" \
EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
EXPO_PUBLIC_FPL_BASE_URL="http://127.0.0.1:$FPL_PORT" \
EXPO_NO_DOTENV=1 \
CI=1 npx expo start --port "$METRO_PORT" >"$ART/metro.log" 2>&1 &
METRO_PID=$!
# `npx expo start` forks a long-lived Metro node child that outlives the npx
# wrapper — a bare kill of $METRO_PID orphans a listener on :$METRO_PORT that
# then collides with the next run. Kill the whole descendant TREE instead. Do
# NOT "sweep whatever holds the port" as a fallback: kill-by-port once took out
# an unrelated project's dev server that legitimately held 8081 — the preflight
# above makes a foreign port-holder a loud pre-run failure, never our victim.
kill_tree() {
  local pid=$1 child
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
  kill "$pid" 2>/dev/null || true
}
cleanup() {
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

# ---------- hold ----------
# E2E_HOLD=1 stands the harness up and stops there, for manual/semi-automated
# on-simulator validation that Maestro can't drive alone (e.g. #73's Face ID
# plan, which needs Simulator ▸ Features ▸ Face ID menu clicks between steps).
# Ctrl-C tears everything down via the trap above.
if [ -n "${E2E_HOLD:-}" ]; then
  say "HOLD — services up, app installed. Ctrl-C to tear down."
  say "  metro :$METRO_PORT · fpl :$FPL_PORT · users e2e-a@/e2e-b@fantasygaffer.test pw e2e-password-1"
  say "  deep link: fplgafferreactnativeapp://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${METRO_PORT}"
  while true; do sleep 3600; done
fi

# ---------- run ----------
say "running maestro: $FLOW"
maestro test \
  -e DEV_CLIENT_URL="fplgafferreactnativeapp://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${METRO_PORT}" \
  -e EMAIL_A="e2e-a@fantasygaffer.test" \
  -e EMAIL_B="e2e-b@fantasygaffer.test" \
  -e PASSWORD="e2e-password-1" \
  -e ENTRY_ID="$E2E_ENTRY_ID" \
  -e PLAYER_NAME="$E2E_PLAYER_NAME" \
  -e GK_NAME="$E2E_GK_NAME" \
  "$FLOW"
say "GREEN — all flows passed"
