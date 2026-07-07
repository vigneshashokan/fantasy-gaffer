"""#128 serving entry point: Postgres in, projections_shadow out. Thin I/O
around model/serving.py; run nightly by .github/workflows/xpts-serve.yml.
DB-only by design — zero FPL API calls (spec §3).

Usage: python serve_v3.py [--season 2025/26] [--as-of-gw 30] [--dry-run]
                          [--n-sims 8000]
Env:   DATABASE_URL (falls back to the local stack), XPTS_SERVE_TABLE
       (default projections_shadow; allowlisted)."""
from __future__ import annotations

import argparse
import os
import sys

import pandas as pd
import psycopg

from backtest_v31 import MODEL_VERSION_V31
from data import DEFAULT_DATABASE_URL, load_history
from serving import season_label_for, select_target_gws, serve_rows

ALLOWED_TABLES = ("projections_shadow", "projections")
CONTRACT_COLUMNS = ["player_id", "gw", "p25", "p50", "p75"]
DEPTH_COLUMNS = ["mean", "p_goal", "p_assist", "p_cs", "p_haul", "p60"]


def load_fixtures(url: str) -> pd.DataFrame:
    with psycopg.connect(url) as conn:
        return pd.read_sql(
            "select id, event, kickoff_time, team_h, team_a, finished "
            "from public.fixtures", conn)


def build_upsert_sql(table: str, include_depth: bool) -> str:
    if table not in ALLOWED_TABLES:
        raise ValueError(
            f"XPTS_SERVE_TABLE must be one of {ALLOWED_TABLES}, got {table!r}")
    cols = CONTRACT_COLUMNS + ["model_version"] + (DEPTH_COLUMNS if include_depth else [])
    col_list = ", ".join(cols)
    placeholders = ", ".join(f"%({c})s" for c in cols)
    updates = ", ".join(f"{c} = excluded.{c}" for c in cols
                        if c not in ("player_id", "gw"))
    return (f"insert into public.{table} ({col_list}, computed_at) "
            f"values ({placeholders}, now()) "
            f"on conflict (player_id, gw) do update set {updates}, "
            f"computed_at = now()")


def upsert_rows(url: str, table: str, rows: pd.DataFrame) -> int:
    include_depth = table == "projections_shadow"
    sql = build_upsert_sql(table, include_depth)
    cols = CONTRACT_COLUMNS + (DEPTH_COLUMNS if include_depth else [])
    params = []
    for _, r in rows.iterrows():
        p = {c: (int(r[c]) if c in ("player_id", "gw") else float(r[c]))
             for c in cols}
        p["model_version"] = MODEL_VERSION_V31
        params.append(p)
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, params)
        conn.commit()
    return len(params)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Serve v3.1 projections")
    ap.add_argument("--season", default=None,
                    help="override the kickoff-derived season label")
    ap.add_argument("--as-of-gw", type=int, default=None,
                    help="historical mode: history filtered to gw < N, "
                         "targets = GWs >= N (spec §3 CLI)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--n-sims", type=int, default=None)
    args = ap.parse_args(argv)

    url = os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)
    table = os.environ.get("XPTS_SERVE_TABLE", "projections_shadow")
    build_upsert_sql(table, table == "projections_shadow")  # fail fast on a bad name

    fixtures = load_fixtures(url)
    target_gws = select_target_gws(fixtures, as_of_gw=args.as_of_gw)
    if not target_gws:
        print("[serve-v31] skipped: no unfinished fixtures (off-season)")
        return 0
    first_kick = (fixtures[fixtures["event"].isin(target_gws)]["kickoff_time"]
                  .dropna().min())
    season = args.season or season_label_for(first_kick)
    history = load_history(database_url=url, season=season)
    if args.as_of_gw is not None:
        history = history[history["gw"] < args.as_of_gw]
    if len(history) == 0:
        print(f"[serve-v31] skipped: no {season} history yet (pre-GW1)")
        return 0

    kwargs = {} if args.n_sims is None else {"n_sims": args.n_sims}
    rows, info = serve_rows(history, fixtures, target_gws, **kwargs)
    if args.dry_run:
        print(rows.head(10).to_string())
        print(f"[serve-v31] DRY RUN season={season} gws={info['target_gws']} "
              f"k={info['k_assist']:.4f} targets={info['n_targets']} "
              f"rows={info['n_rows']}")
        return 0
    n = upsert_rows(url, table, rows)
    print(f"[serve-v31] season={season} gws={info['target_gws']} "
          f"k={info['k_assist']:.4f} targets={info['n_targets']} rows={n} "
          f"table={table}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
