"""#130 prospective eval + promotion check (spec §7 — the frozen prospective
registration). On-demand and read-only: recomputes the scoreboard from durable
tables (shadow + projections split by model_version, history actuals, the
deadline-frozen snapshot ep_next) and refreshes docs/xpts-prospective.md below
its marker. Promotion condition (strict, user decision 2026-07-07):
>= 6 evaluated GWs AND full-pool MAE lead AND captaincy not behind.

Usage: python eval_prospective.py [--season 2026/27] [--doc docs/xpts-prospective.md]"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import psycopg

from backtest_v31 import bootstrap_captaincy
from data import DEFAULT_DATABASE_URL
from serving import season_label_for

SCOREBOARD_MARKER = "<!-- xpts-prospective-scoreboard -->"
MIN_EVAL_GWS = 6
STARTER_MINUTES = 60


def season_cutoff(season: str) -> datetime:
    """Projection rows count for a season iff computed_at >= July 1 of its
    start year (spec §7 — guards stale rows under reused element ids)."""
    return datetime(int(season.split("/")[0]), 7, 1, tzinfo=timezone.utc)


def split_by_model(rows: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Attribution strictly by model_version, never table identity (spec §7)."""
    v31 = rows[rows["model_version"] == "v3.1"].copy()
    v1 = rows[rows["model_version"].str.startswith("v1")].copy()
    return v31, v1


def load_frames(url: str, season: str) -> dict:
    cutoff = season_cutoff(season)
    with psycopg.connect(url) as conn:
        rows = pd.read_sql(
            "select player_id, gw, p50, mean, model_version from ("
            " select player_id, gw, p50, mean, model_version, computed_at"
            "   from public.projections_shadow"
            " union all"
            " select player_id, gw, p50, null::numeric as mean, model_version,"
            "   computed_at from public.projections"
            ") u where computed_at >= %(c)s", conn, params={"c": cutoff})
        actuals = pd.read_sql(
            "select player_id, gw, sum(total_points) as actual,"
            " sum(minutes) as minutes from public.player_gw_history"
            " where season = %(s)s group by player_id, gw",
            conn, params={"s": season})
        ep = pd.read_sql(
            "select player_id, gw, ep_next from public.player_gw_snapshots"
            " where season = %(s)s and ep_next > 0",  # 0 = unparseable-at-capture
            conn, params={"s": season})
    for df, cols in ((rows, ["p50", "mean"]), (actuals, ["actual", "minutes"]),
                     (ep, ["ep_next"])):
        for c in cols:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return {"rows": rows, "actuals": actuals, "ep": ep}


def joint_frame(v31: pd.DataFrame, v1: pd.DataFrame,
                actuals: pd.DataFrame) -> pd.DataFrame:
    """Full joint pool: both models emitted AND an actual exists (spec §7)."""
    return (v31.rename(columns={"p50": "p50_v31"})
            [["player_id", "gw", "p50_v31", "mean"]]
            .merge(v1.rename(columns={"p50": "p50_v1"})
                   [["player_id", "gw", "p50_v1"]],
                   on=["player_id", "gw"], how="inner")
            .merge(actuals, on=["player_id", "gw"], how="inner"))


def evaluated_gws(v31: pd.DataFrame, v1: pd.DataFrame,
                  actuals: pd.DataFrame) -> list[int]:
    s = set(v31["gw"]) & set(v1["gw"]) & set(actuals["gw"])
    return sorted(int(g) for g in s)


def _mae(pred: pd.Series, actual: pd.Series) -> float:
    return float(np.abs(pred - actual).mean()) if len(pred) else 0.0


def mae_summary(joint: pd.DataFrame) -> dict:
    starters = joint[joint["minutes"] >= STARTER_MINUTES]
    return {
        "full": {"n": int(len(joint)),
                 "v31": _mae(joint["p50_v31"], joint["actual"]),
                 "v1": _mae(joint["p50_v1"], joint["actual"])},
        "starters": {"n": int(len(starters)),
                     "v31": _mae(starters["p50_v31"], starters["actual"]),
                     "v1": _mae(starters["p50_v1"], starters["actual"])},
    }


def ep_summary(ep: pd.DataFrame, joint: pd.DataFrame) -> dict:
    """ep_next benchmark computed on the same pool as the models (spec §7) —
    merged onto the JOINT frame's (player_id, gw) keys, not the larger,
    easier ep∩actuals pool (which would include never-played players where a
    near-zero ep_next is trivially accurate)."""
    e = ep.merge(joint[["player_id", "gw", "actual"]], on=["player_id", "gw"],
                how="inner")
    return {"n": int(len(e)), "mae": _mae(e["ep_next"], e["actual"])}


def captain_picks(v31: pd.DataFrame, v1: pd.DataFrame, ep: pd.DataFrame,
                  actuals: pd.DataFrame, gws: list[int]) -> pd.DataFrame:
    """Ex-ante argmax per model over ITS OWN projected rows (spec §7 — no
    hindsight pool filtering); a pick with no history row scores 0 (did not
    feature). v3.1 ranks by its registered ranking functional, the mean."""
    act = actuals.set_index(["player_id", "gw"])["actual"]
    pools = {"v31": (v31.dropna(subset=["mean"]), "mean"),
             "v1": (v1, "p50"),
             "ep": (ep, "ep_next")}
    rows = []
    for gw in gws:
        for model, (pool, col) in pools.items():
            g = pool[pool["gw"] == gw]
            if len(g) == 0:
                continue
            pick = g.sort_values([col, "player_id"],
                                 ascending=[False, True]).iloc[0]
            pid = int(pick["player_id"])
            rows.append({"gw": int(gw), "model": model, "player_id": pid,
                         "pred": float(pick[col]),
                         "actual": float(act.get((pid, int(gw)), 0.0))})
    return pd.DataFrame(rows, columns=["gw", "model", "player_id", "pred",
                                       "actual"])


def promotion_status(n_gws: int, mae: dict, cap: dict) -> tuple[str, str]:
    if n_gws < MIN_EVAL_GWS:
        return "HOLD", f"only {n_gws} evaluated GWs (need >= {MIN_EVAL_GWS})"
    if not mae["full"]["v31"] < mae["full"]["v1"]:
        return "HOLD", (f"MAE not ahead ({mae['full']['v31']:.4f} vs "
                        f"{mae['full']['v1']:.4f})")
    if cap["v31"] < cap["v1"]:
        return "HOLD", (f"captaincy behind ({cap['v31']:.0f} vs "
                        f"{cap['v1']:.0f})")
    return "PROMOTE-ELIGIBLE", "all conditions met"


def render_scoreboard(season: str, gws: list[int], mae: dict, ep: dict,
                      cap: dict, boot: dict | None,
                      status: tuple[str, str]) -> str:
    lines = [
        f"Season **{season}** · evaluated GWs: **{len(gws)}**"
        f" ({', '.join(str(g) for g in gws) if gws else 'none yet'})",
        "",
        "| metric | v3.1 | v1 | ep_next |",
        "|---|---|---|---|",
        (f"| MAE, full joint pool (n = {mae['full']['n']}) "
         f"| {mae['full']['v31']:.4f} | {mae['full']['v1']:.4f} "
         f"| {ep['mae']:.4f} (n = {ep['n']}) |"),
        (f"| MAE, starters ≥ {STARTER_MINUTES}′ (diagnostic, n = "
         f"{mae['starters']['n']}) | {mae['starters']['v31']:.4f} "
         f"| {mae['starters']['v1']:.4f} | — |"),
        (f"| captaincy (cumulative) | {cap.get('v31', 0.0):.0f} "
         f"| {cap.get('v1', 0.0):.0f} | {cap.get('ep', 0.0):.0f} |"),
        "",
    ]
    if boot is not None:
        lines.append(
            f"Bootstrap Σ(v3.1 − v1) captain deltas (context, not a gate): "
            f"q10 {boot['q10']:+.1f} · q50 {boot['q50']:+.1f} · "
            f"q90 {boot['q90']:+.1f} · P(worse) {boot['p_worse']:.3f}\n")
    lines.append(f"**Status: {status[0]}** — {status[1]}")
    return "\n".join(lines)


def write_doc(path: str, scoreboard: str) -> None:
    """Replace everything below the marker; the runbook above it is
    hand-maintained and must survive every refresh."""
    with open(path) as f:
        content = f.read()
    if SCOREBOARD_MARKER not in content:
        raise ValueError(f"scoreboard marker missing from {path}")
    head = content[: content.index(SCOREBOARD_MARKER)].rstrip()
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    with open(path, "w") as f:
        f.write(head + "\n\n" + SCOREBOARD_MARKER +
                f"\n\n_Last refreshed: {stamp}_\n\n" + scoreboard + "\n")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Prospective eval (#130)")
    ap.add_argument("--season", default=None)
    ap.add_argument("--doc", default=os.path.normpath(os.path.join(
        os.path.dirname(__file__), "..", "docs", "xpts-prospective.md")))
    args = ap.parse_args(argv)
    url = os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)
    season = args.season or season_label_for(datetime.now(timezone.utc))

    frames = load_frames(url, season)
    v31, v1 = split_by_model(frames["rows"])
    gws = evaluated_gws(v31, v1, frames["actuals"])
    joint = joint_frame(v31[v31["gw"].isin(gws)], v1[v1["gw"].isin(gws)],
                        frames["actuals"])
    mae = mae_summary(joint)
    ep = ep_summary(frames["ep"], joint)
    picks = captain_picks(v31, v1, frames["ep"], frames["actuals"], gws)
    cap = (picks.groupby("model")["actual"].sum().to_dict()
           if len(picks) else {})
    boot = None
    mv = picks[picks["model"].isin(["v31", "v1"])] if len(picks) else picks
    if len(mv) and mv["gw"].nunique() >= 2:
        b = bootstrap_captaincy(mv)
        boot = {k: b[k] for k in ("q10", "q50", "q90", "p_worse")}
    status = promotion_status(len(gws), mae,
                              {"v31": cap.get("v31", 0.0),
                               "v1": cap.get("v1", 0.0)})
    board = render_scoreboard(season, gws, mae, ep, cap, boot, status)
    print(board)
    write_doc(args.doc, board)
    print(f"\n[eval-prospective] wrote {args.doc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
