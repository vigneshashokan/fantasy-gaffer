# FPL API Reference

This is the human-readable map of the public FPL endpoints our ingestion job (#20) consumes, the quirks we've hit, and how to operate the job.

Authoritative code: `supabase/functions/fpl-ingest/`.
Spec: `docs/superpowers/specs/2026-06-10-fpl-data-ingestion-design.md`.

## Endpoints used

| Endpoint | What we pull | Cron |
|---|---|---|
| `GET https://fantasy.premierleague.com/api/bootstrap-static/` | `teams[]` → `clubs`; `elements[]` → `players` | Mon + Tue 02:00 UTC (calendar-gated) |
| `GET https://fantasy.premierleague.com/api/fixtures/` | flat array → `fixtures` | Tue 03:00 UTC (content-hash-gated) |

Endpoints **not** used by this job:
- `/event/{n}/live/` — live scoring; owned by issue #37 (Phase 4).
- `/element-summary/{player_id}/` — per-player history; fetched lazily by the app when player detail (#28) or xPts (#30) needs it.
- `/entry/{id}/` — manager-specific data; owned by issue #22 (squad import).

## Field quirks

These are the foot-guns. Hit them once.

- **`element_type`** is `1 | 2 | 3 | 4`. Map: `1 → GKP`, `2 → DEF`, `3 → MID`, `4 → FWD`. We store the string in `players.position`.
- **`now_cost`** is **tenths of millions**, not millions. `55` = £5.5m. The app divides by 10 on display.
- **`form`, `ep_next`, `ep_this`, `selected_by_percent`, `ict_index`** come back as **strings** (`"5.6"`, not `5.6`). Always `parseFloat`.
- **`status`** is a single character: `a` (available), `i` (injured), `d` (doubt), `u` (unavailable), `s` (suspended), `n` (not in squad).
- **`news`** can be an empty string `""` rather than null — we default the DB column to `''`.
- **`chance_of_playing_next_round`** can be `null` (means "no concern flagged"), otherwise one of `0 / 25 / 50 / 75 / 100`.
- **Fixtures `event`** can be `null` for postponed matches awaiting reschedule. **`kickoff_time`** can be `null` for the same reason.

## Refresh cadence

Configured in `supabase/functions/fpl-ingest/lib/calendar.ts`. Update at season rollover via a one-line PR.

- **PL season:** `2026-08-15` → `2027-05-25` (inclusive).
- **Transfer windows:** `2026-06-15` → `2026-09-01` (summer); `2027-01-01` → `2027-02-01` (winter).

The bootstrap cron fires every Mon + Tue at 02:00 UTC year-round. The function early-exits if `today` is outside the PL season AND outside every transfer window, producing one `ingestion_runs` row with `status='skipped'`, `skip_reason='outside refresh window'`. Off-season + non-window: zero FPL traffic, zero DB writes.

The fixtures cron fires every Tue at 03:00 UTC. The function fetches `/fixtures/`, computes a SHA-256 over a stable projection (`id`, `event`, `kickoff_time`, `team_h`, `team_a`, `finished` — scores deliberately excluded), and compares to the most recent successful run's `content_hash`. Match → skip + log no-op. Differ → upsert + store new hash.

## Manual operations

### Force an immediate run (bypasses calendar gate)

```bash
curl -X POST "https://<ref>.supabase.co/functions/v1/fpl-ingest?source=bootstrap&force=1" \
  -H "Authorization: Bearer <anon-key>"

curl -X POST "https://<ref>.supabase.co/functions/v1/fpl-ingest?source=fixtures" \
  -H "Authorization: Bearer <anon-key>"
```

`?force=1` is permanently supported on `bootstrap`. Use it for initial backfill after deploy, season rollover, or one-off debugging. Fixtures doesn't need `force=1` — only the content-hash short-circuits it.

### "Is the pipeline alive?" — paste into Studio SQL

```sql
select source, status, skip_reason, rows_upserted,
       started_at, finished_at - started_at as duration
  from public.ingestion_runs
 order by started_at desc
 limit 20;
```

### "Last successful run per source"

```sql
select distinct on (source) source, started_at, status, rows_upserted, content_hash
  from public.ingestion_runs
 where status = 'success'
 order by source, started_at desc;
```

### Local E2E

```bash
./scripts/test-ingest-locally.sh
```

Requires `supabase start` and `supabase functions serve fpl-ingest`. Hits the real FPL API.

## Known limits

- No live scoring (#37 owns).
- No per-player history (lazy via the app when #28/#30 needs it).
- Price-change history not snapshotted — `players` is current-state only.
- Alerting via `ingestion_runs` queries only until Sentry (#41) lands.
