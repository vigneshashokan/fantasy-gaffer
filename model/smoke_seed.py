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

import pandas as pd

from feature_spec import FORM_STATS
from seed import blend_rates, pseudo_rows
from seed_spec import SEED_DENOMINATOR

TRAIN_THROUGH_GW = 19
EVAL_GWS = (20, 21, 22, 23, 24)


def season_aggregate(rows: pd.DataFrame, n_fixtures: int) -> dict:
    """Collapse per-fixture rows into a history_past-shaped aggregate.

    Scale to a full-season equivalent so blend_rates' fixed SEED_DENOMINATOR
    yields the true per-fixture rate. Production always seeds from complete
    38-fixture seasons; this smoke test deliberately uses a 19-gameweek
    window, so without this the whole comparison is off by exactly 19/38.
    """
    scale = SEED_DENOMINATOR / float(n_fixtures)
    agg = {stat: float(rows[stat].sum()) * scale for stat in FORM_STATS}
    agg["starts"] = float(rows["starts"].sum()) * scale
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

    print("\nDenominator check — the question production actually faces: given a")
    print("player's FULL-season total, does /38 (blank-inclusive, our current")
    print("choice) or /actual-appearances better reproduce v1's real form?")
    rows = []
    for pid, pdf in hist.groupby("player_id"):
        apps = int((pdf["minutes"] > 0).sum())
        total = float(pdf["total_points"].sum())
        last6 = pdf.sort_values(["gw", "fixture_id"], ascending=False).head(6)
        real = float(last6["total_points"].mean())
        rows.append({
            "apps": apps,
            "err_38": abs(total / 38 - real),
            "err_apps": abs(total / max(1, apps) - real),
        })
    dcheck = pd.DataFrame(rows)
    # "most of the window" vs "few": split at 19, half of the 38-gw season —
    # the approximation is only suspected to hurt partial-season players, so a
    # single pooled number would hide that.
    groups = (
        ("all players", dcheck),
        ("regular (apps>=19)", dcheck[dcheck.apps >= 19]),
        ("partial (apps<19)", dcheck[dcheck.apps < 19]),
    )
    print(f"  {'group':<22} {'n':>5} {'/38 MAE':>10} {'/apps MAE':>10}")
    for label, g in groups:
        print(f"  {label:<22} {len(g):>5} {g.err_38.mean():>10.4f} {g.err_apps.mean():>10.4f}")

    print(f"\neval rows available GW{EVAL_GWS[0]}-{EVAL_GWS[-1]}: {len(evalr)}")
    print("\nRead this as: ratios near 1.0 and correlations >0.7 mean the "
          "synthesis is in distribution. A ratio far from 1.0 on any single "
          "feature means the frozen coefficient for it is being fed a value it "
          "never saw in training — stop and fix before Task 4.")


if __name__ == "__main__":
    main()
