"""Stage 0 smoke test for #212 — is the synthesized feature vector in
distribution for v1's frozen coefficients?

Builds pseudo-rows from 2025/26 GW1-19 aggregates, scores GW20-24, and compares
against real v1 running on full history. No API calls, no survivorship: the
population is one season's players scored against themselves.

This is NOT the gate (that is model/backtest_seed.py). Its job is to catch a
broken synthesis BEFORE the ingest, migration and harness are built.

Usage: python smoke_seed.py [--history model/data/player_gw_history_2025-26.csv.gz]
"""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from feature_spec import FEATURE_COLUMNS, FORM_STATS
from features import build_feature_row
from seed import blend_rates, pseudo_rows

TRAIN_THROUGH_GW = 19
EVAL_GWS = (20, 21, 22, 23, 24)


def season_aggregate(rows: pd.DataFrame, n_fixtures: int) -> dict:
    """Collapse per-fixture rows into a history_past-shaped aggregate.

    n_fixtures is passed rather than assumed so this can use the TRUE window
    length (19) here, while serving uses SEED_DENOMINATOR (38). That difference
    is exactly what Step 7 measures.
    """
    agg = {stat: float(rows[stat].sum()) for stat in FORM_STATS}
    agg["starts"] = float(rows["starts"].sum())
    agg["_n_fixtures"] = n_fixtures
    return agg


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--history", default="data/player_gw_history_2025-26.csv.gz")
    args = ap.parse_args()

    hist = pd.read_csv(args.history)
    print(f"loaded {len(hist)} rows, gw {hist.gw.min()}-{hist.gw.max()}")

    prior = hist[hist.gw <= TRAIN_THROUGH_GW]
    evalr = hist[hist.gw.isin(EVAL_GWS)]

    seeded_form, real_form = [], []
    for pid, pdf in prior.groupby("player_id"):
        rates = blend_rates([season_aggregate(pdf, TRAIN_THROUGH_GW)])
        if rates is None:
            continue
        rows = pseudo_rows(rates)
        seeded_form.append({"player_id": pid, **{s: rows[0][s] for s in FORM_STATS},
                            "xmin": rows[0]["starts"]})
        # What v1 actually sees at GW20: the last 6 real rows.
        last6 = pdf.sort_values(["gw", "fixture_id"], ascending=False).head(6)
        real_form.append({"player_id": pid,
                          **{s: float(last6[s].mean()) for s in FORM_STATS},
                          "xmin": float(last6["starts"].mean())})

    sf = pd.DataFrame(seeded_form).set_index("player_id")
    rf = pd.DataFrame(real_form).set_index("player_id")
    joined = sf.join(rf, lsuffix="_seed", rsuffix="_real", how="inner")

    print(f"\n{'feature':<34} {'seed mean':>10} {'real mean':>10} {'ratio':>7} {'corr':>7}")
    for col in list(FORM_STATS) + ["xmin"]:
        s, r = joined[f"{col}_seed"], joined[f"{col}_real"]
        ratio = s.mean() / r.mean() if r.mean() else float("nan")
        print(f"{col:<34} {s.mean():>10.4f} {r.mean():>10.4f} "
              f"{ratio:>7.3f} {s.corr(r):>7.3f}")

    print("\nDenominator check — which divisor reproduces real form best?")
    for label, denom in (("window length (19)", 19), ("SEED_DENOMINATOR (38)", 38),
                         ("mean appearances", None)):
        errs = []
        for pid, pdf in prior.groupby("player_id"):
            d = denom or max(1.0, float((pdf["minutes"] > 0).sum()))
            last6 = pdf.sort_values(["gw", "fixture_id"], ascending=False).head(6)
            errs.append(abs(float(pdf["total_points"].sum()) / d
                            - float(last6["total_points"].mean())))
        print(f"  {label:<24} MAE vs real form_total_points: {np.mean(errs):.4f}")

    print(f"\neval rows available GW{EVAL_GWS[0]}-{EVAL_GWS[-1]}: {len(evalr)}")
    print("\nRead this as: ratios near 1.0 and correlations >0.7 mean the "
          "synthesis is in distribution. A ratio far from 1.0 on any single "
          "feature means the frozen coefficient for it is being fed a value it "
          "never saw in training — stop and fix before Task 4.")


if __name__ == "__main__":
    main()
