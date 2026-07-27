"""Stage 1 gate for #212 — cross-season seeding.

Seed from 2024/25 (0.7) + 2023/24 (0.3), predict 2025/26 GW1-5, score against
player_gw_history actuals.

GATE CRITERIA ARE FROZEN IN spec §7. Do not tune against them and re-register.

Arms:
  S — seeded pseudo-rows -> frozen v1 coefficients
  H — blended total_points/38 (r_total_points), the naive prior-season signal
  V — real v1 on its 1-4 rows of history; what ships today; GW2-5 only

Data sources — each is deliberate, see the module constants:
  actuals + priors : model/data/player_gw_history_2025-26.csv.gz (NOT the local
      DB, which has zero 2025/26 rows after a `db reset`)
  code -> element id + team strengths : e2e/fixtures/raw/bootstrap-static.json.gz
      (the only surviving 2025/26 bootstrap; the live API serves 2026/27, whose
      team ids and element ids denote different clubs and players)
  seeds : local Postgres public.player_season_history

Usage: python backtest_seed.py /tmp/xpts-seed/results.csv
"""
from __future__ import annotations

import gzip
import json
import os
import sys

import numpy as np
import pandas as pd

from data import DEFAULT_DATABASE_URL, parse_team_strengths
from feature_spec import FORM_STATS, POSITIONS
from features import build_feature_row
from metrics import mae
from seed import blend_rates, newcomer_rates, pseudo_rows
from seed_spec import SEED_DENOMINATOR, SEED_MODEL_VERSION
from train import predict

MARKER = "<!-- xpts-seed-results -->"
EVAL_GWS = (1, 2, 3, 4, 5)
SEED_SEASONS = ("2024/25", "2023/24")   # most recent first
G1_MIN_PRIOR_STARTS = 10
G2_MIN_STARTS = 20

_HERE = os.path.dirname(os.path.abspath(__file__))
BOOTSTRAP_2025_26 = os.path.join(_HERE, "..", "e2e", "fixtures", "raw",
                                 "bootstrap-static.json.gz")
HISTORY_CSV = os.path.join(_HERE, "data", "player_gw_history_2025-26.csv.gz")
ARTIFACT_V1 = os.path.join(_HERE, "artifacts", "xpts-v1.json")
REPORT_PATH = os.path.normpath(os.path.join(_HERE, "..", "docs", "xpts-model.md"))

# player_season_history columns blend_rates consumes (FORM_STATS already ends
# with total_points), plus what the k-NN newcomer path needs.
_SEED_NUMERIC = list(FORM_STATS) + ["starts", "end_cost"]


# --------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------

def load_bootstrap_2025_26(path: str = BOOTSTRAP_2025_26) -> dict:
    with gzip.open(path, "rt") as fh:
        return json.load(fh)


def load_2025_26_code_map(bootstrap: dict) -> pd.DataFrame:
    """The committed E2E capture is a 2025/26 bootstrap, so it is the only
    code->id map for that season now that the API has rolled over."""
    return pd.DataFrame(
        [{"id": e["id"], "code": e["code"],
          "position": POSITIONS[int(e["element_type"]) - 1],
          "now_cost": e["now_cost"], "web_name": e["web_name"]}
         for e in bootstrap["elements"]]
    )


def load_seeds(database_url: str | None = None,
               seasons: tuple[str, ...] = SEED_SEASONS) -> pd.DataFrame:
    """Raw season aggregates for the seed seasons, from the local stack."""
    import psycopg

    url = database_url or os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)
    cols = ", ".join(["season", "element_code"] + _SEED_NUMERIC)
    with psycopg.connect(url) as conn:
        df = pd.read_sql(
            f"select {cols} from public.player_season_history "
            "where season = any(%(s)s)",
            conn, params={"s": list(seasons)},
        )
    for c in _SEED_NUMERIC:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)
    return df


def load_eval_history(path: str = HISTORY_CSV) -> pd.DataFrame:
    """2025/26 actuals, with was_home coerced to a real bool.

    The CSV stores it as 't'/'f'. `bool("f")` is True, so an unparsed column
    silently makes every fixture a home fixture and hands every row the
    opponent's away strengths — wrong for both S and V, and invisible in the
    output. Do NOT gate this on `dtype == object`: pandas 3 infers `str` for
    that column, so the guard is False and the parse is skipped.
    """
    df = pd.read_csv(path)
    wh = df["was_home"]
    if wh.dtype != bool:
        # Map FIRST and check for NaN before astype(bool): an unmapped value
        # becomes NaN, and bool(NaN) is True — the same silent-home failure the
        # dtype guard caused. The both-classes assert below only catches an
        # ALL-unmapped column, so it cannot stand in for this.
        mapped = wh.map({"t": True, "f": False, "True": True, "False": False})
        if mapped.isna().any():
            raise ValueError(
                f"unexpected was_home values: {sorted(set(wh[mapped.isna()]))}")
        df["was_home"] = mapped.astype(bool)
    assert set(df["was_home"].unique()) == {True, False}, \
        "was_home did not parse to both classes"
    return df


# --------------------------------------------------------------------------
# The cross-season join
# --------------------------------------------------------------------------

def join_by_code(seeds: pd.DataFrame, bootstrap: pd.DataFrame) -> pd.DataFrame:
    """Map element_code -> that season's element id. Inner join: an unmatched
    code is dropped, never guessed."""
    out = seeds.merge(
        bootstrap[["id", "code"]], left_on="element_code", right_on="code", how="inner"
    )
    return out.rename(columns={"id": "player_id"}).drop(columns=["code"])


# --------------------------------------------------------------------------
# Arms
# --------------------------------------------------------------------------

def _rates_by_player(seeded: pd.DataFrame) -> tuple[dict[int, dict], dict[int, float]]:
    """player_id -> blended rates, and player_id -> the most recent seed
    season's end_cost (the k-NN reference price)."""
    order = {s: i for i, s in enumerate(SEED_SEASONS)}
    rates: dict[int, dict] = {}
    end_cost: dict[int, float] = {}
    for pid, pdf in seeded.groupby("player_id"):
        pdf = pdf.assign(_o=pdf["season"].map(order)).sort_values("_o")
        r = blend_rates(pdf.to_dict("records"))
        if r is None:
            continue
        rates[int(pid)] = r
        end_cost[int(pid)] = float(pdf.iloc[0]["end_cost"])
    return rates, end_cost


def _newcomer_pool(rates: dict[int, dict], end_cost: dict[int, float],
                   code_map: pd.DataFrame) -> list[dict]:
    """Reason to exist: the inclusive-G2 check. The k-NN path feeds no gate
    criterion — its MAE diagnostic proves nothing, because the unseeded backtest
    population is departed veterans, not newcomers. What it DOES buy is a
    ranking pool that includes unseeded players, so G2 can be asked whether an
    unproven player tops the board once they are allowed in (`inclusive_passes`).
    """
    pos_by_id = code_map.set_index("id")["position"].to_dict()
    code_by_id = code_map.set_index("id")["code"].to_dict()
    return [
        {"position": pos_by_id[pid], "end_cost": end_cost[pid],
         "element_code": code_by_id[pid], "rates": r}
        for pid, r in rates.items() if pid in pos_by_id
    ]


def build_arms(history: pd.DataFrame, seeded: pd.DataFrame, code_map: pd.DataFrame,
               team_strengths: dict, artifact: dict) -> pd.DataFrame:
    """One row per (player, gameweek) in EVAL_GWS carrying all three arms.

    S and V both run the frozen v1 coefficients through the UNCHANGED
    build_feature_row; they differ only in whether the pseudo-rows are prepended.
    """
    rates, end_cost = _rates_by_player(seeded)
    pool = _newcomer_pool(rates, end_cost, code_map)
    names = code_map.set_index("id")["web_name"].to_dict()

    ev = history[history["gw"].isin(EVAL_GWS)]
    out: list[dict] = []
    for pid, pdf in history.groupby("player_id"):
        pid = int(pid)
        targets = pdf[pdf["gw"].isin(EVAL_GWS)]
        if targets.empty:
            continue
        r = rates.get(pid)
        is_seeded = r is not None
        if r is None:
            # Backtest caveat: most unseeded eval players are NOT newcomers,
            # they are 2025/26 players absent from today's bootstrap, so their
            # history_past was never fetched. Kept as a labelled diagnostic
            # only; is_seeded gates them out of the gate population.
            first = targets.sort_values("gw").iloc[0]
            r = newcomer_rates(first["position"], int(first["value"]), pool)
        if r is None:
            continue
        prior_starts = float(r["starts"]) * SEED_DENOMINATOR
        seed_rows = pd.DataFrame(pseudo_rows(r))

        for _, target in targets.iterrows():
            gw = int(target["gw"])
            prior_real = pdf[(pdf["gw"] < gw) & (pdf["gw"] >= 1)]
            pos = target["position"]

            feat_s = build_feature_row(
                pd.concat([seed_rows, prior_real], ignore_index=True),
                target, team_strengths)
            row = {
                "player_id": pid, "web_name": names.get(pid, ""), "gw": gw,
                "position": pos, "actual": float(target["total_points"]),
                "is_seeded": bool(is_seeded), "prior_starts": prior_starts,
                "minutes": int(target["minutes"]),
                "value": int(target["value"]),
                "n_prior_real": int(len(prior_real)),
                "S_p25": predict(artifact, feat_s, pos, 0.25),
                "S_p50": predict(artifact, feat_s, pos, 0.50),
                "S_p75": predict(artifact, feat_s, pos, 0.75),
                "H_p50": float(r["total_points"]),
                "xmin_seeded": feat_s["xmin"],
            }
            if len(prior_real):
                feat_v = build_feature_row(prior_real, target, team_strengths)
                row.update({
                    "V_p25": predict(artifact, feat_v, pos, 0.25),
                    "V_p50": predict(artifact, feat_v, pos, 0.50),
                    "V_p75": predict(artifact, feat_v, pos, 0.75),
                    "xmin_real": feat_v["xmin"],
                })
            else:
                row.update({"V_p25": np.nan, "V_p50": np.nan, "V_p75": np.nan,
                            "xmin_real": np.nan})
            out.append(row)

    df = pd.DataFrame(out)
    assert len(df.groupby(["player_id", "gw"]).size().loc[lambda s: s > 1]) == 0, \
        "duplicate (player, gw) rows — GW1-5 is expected to be DGW-free"
    assert len(ev) >= len(df), "produced more prediction rows than history rows"
    return df.sort_values(["gw", "player_id"]).reset_index(drop=True)


# --------------------------------------------------------------------------
# Gate criteria
# --------------------------------------------------------------------------

def seed_season_floor(seeds: pd.DataFrame) -> dict[str, float]:
    """G0's per-position constant: mean per-fixture points over the SEED seasons.

    Takes no eval-window argument by construction. A floor computed on its own
    answer is unbeatable, which would make G0 meaningless.
    """
    per_fixture = seeds["total_points"] / SEED_DENOMINATOR
    return seeds.assign(_pf=per_fixture).groupby("position")["_pf"].mean().to_dict()


def _floor_series(preds: pd.DataFrame, floor: dict[str, float]) -> pd.Series:
    return preds["position"].map(floor).astype(float)


def evaluate_g0(preds: pd.DataFrame, floor: dict[str, float],
                winner: str) -> dict:
    """G0 (floor): the winning arm must beat the per-position constant on the
    binding (G1) population."""
    capped = preds[preds["prior_starts"] >= G1_MIN_PRIOR_STARTS]
    f_capped = _floor_series(capped, floor)
    f_all = _floor_series(preds, floor)
    win_mae = mae(capped[f"{winner}_p50"], capped["actual"])
    floor_mae = mae(f_capped, capped["actual"])
    return {
        "winner": winner,
        "constants": {k: round(v, 4) for k, v in sorted(floor.items())},
        "n_capped": int(len(capped)),
        "winner_mae": win_mae,
        "floor_mae": floor_mae,
        "floor_mae_uncapped": mae(f_all, preds["actual"]),
        "margin": floor_mae - win_mae,
        "passes": bool(win_mae < floor_mae),
    }


def evaluate_g1(preds: pd.DataFrame) -> dict:
    """G1 (binding): MAE among prior_starts >= 10, uncapped reported alongside.

    S vs H decides the winner; ties go to H (the simpler artifact). V is scored
    on its own defined subset AND S/H are re-scored on that same subset, because
    comparing V's GW2-5 MAE against S's GW1-5 MAE would be a different
    population, not a head-to-head.
    """
    capped = preds[preds["prior_starts"] >= G1_MIN_PRIOR_STARTS]
    out = {
        "n_uncapped": int(len(preds)),
        "n_capped": int(len(capped)),
        "n_players_capped": int(capped["player_id"].nunique()),
    }
    for arm in ("S", "H"):
        out[f"{arm}_mae"] = mae(capped[f"{arm}_p50"], capped["actual"])
        out[f"{arm}_mae_uncapped"] = mae(preds[f"{arm}_p50"], preds["actual"])
    out["winner"] = "S" if out["S_mae"] < out["H_mae"] else "H"
    out["margin"] = abs(out["S_mae"] - out["H_mae"])

    v = capped[capped["V_p50"].notna()]
    v_all = preds[preds["V_p50"].notna()]
    out["n_v_capped"] = int(len(v))
    out["n_v_uncapped"] = int(len(v_all))
    for arm in ("S", "H", "V"):
        out[f"v_subset_{arm}_mae"] = mae(v[f"{arm}_p50"], v["actual"]) if len(v) else float("nan")
        out[f"v_subset_{arm}_mae_uncapped"] = (
            mae(v_all[f"{arm}_p50"], v_all["actual"]) if len(v_all) else float("nan"))
    out["beats_v"] = bool(len(v) and out[f"v_subset_{out['winner']}_mae"] < out["v_subset_V_mae"])
    return out


def evaluate_g2(preds: pd.DataFrame) -> tuple[bool, list[str]]:
    """Pathology guard: across the eval gameweeks the top-ranked pick must never
    be a goalkeeper and must have prior-season starts >= G2_MIN_STARTS.

    Encodes exactly the two failures observed in #211. A pathology check, NOT a
    points comparison — n=5 gameweeks cannot power a paired bootstrap.
    """
    reasons: list[str] = []
    for gw, gdf in preds.groupby("gw"):
        top = gdf.sort_values(["p50", "player_id"], ascending=[False, True]).iloc[0]
        if top["position"] == "GKP":
            reasons.append(f"GW{gw}: top pick is a GKP (player {int(top.player_id)})")
        if top["prior_starts"] < G2_MIN_STARTS:
            reasons.append(
                f"GW{gw}: top pick has {int(top.prior_starts)} prior starts "
                f"(< {G2_MIN_STARTS})"
            )
    return (not reasons), reasons


def top_picks(preds: pd.DataFrame, arm: str) -> pd.DataFrame:
    """The frame evaluate_g2 ranks, with names attached for the write-up.

    Ranked over the UNCAPPED population on purpose: #211's pathology was an
    unproven player topping the whole board, so pre-filtering on prior starts
    would guarantee half of G2.
    """
    df = preds.rename(columns={f"{arm}_p50": "p50"})
    df = df[df["p50"].notna()]
    rows = [gdf.sort_values(["p50", "player_id"], ascending=[False, True]).iloc[0]
            for _, gdf in df.groupby("gw")]
    return pd.DataFrame(rows)[
        ["gw", "player_id", "web_name", "position", "prior_starts", "p50", "actual"]
    ].assign(arm=arm)


# --------------------------------------------------------------------------
# Runner + report
# --------------------------------------------------------------------------

def run_gate(dump_path: str, report_path: str = REPORT_PATH,
             database_url: str | None = None) -> dict:
    """Build arms -> DUMP -> evaluate -> report.

    The dump happens BEFORE any criterion is evaluated (the #127 lesson), so the
    diagnostics analyse the exact scored run. Do not reorder.
    """
    bootstrap = load_bootstrap_2025_26()
    code_map = load_2025_26_code_map(bootstrap)
    strengths = parse_team_strengths(bootstrap)
    history = load_eval_history()
    seeds_raw = load_seeds(database_url)

    seeded = join_by_code(seeds_raw, code_map).merge(
        code_map[["id", "position"]], left_on="player_id", right_on="id", how="left"
    ).drop(columns=["id"])

    counts = {
        "seed_rows_loaded": int(len(seeds_raw)),
        "seed_rows_by_season": seeds_raw.groupby("season").size().to_dict(),
        "seed_codes_loaded": int(seeds_raw["element_code"].nunique()),
        "seed_codes_joined": int(seeded["element_code"].nunique()),
        "seed_codes_dropped": int(seeds_raw["element_code"].nunique()
                                  - seeded["element_code"].nunique()),
        "history_rows_gw1_5": int(len(history[history["gw"].isin(EVAL_GWS)])),
        "history_players_gw1_5": int(history[history["gw"].isin(EVAL_GWS)]["player_id"].nunique()),
    }

    artifact = json.load(open(ARTIFACT_V1))
    preds = build_arms(history, seeded, code_map, strengths, artifact)

    # ---- DUMP FIRST ----
    os.makedirs(os.path.dirname(os.path.abspath(dump_path)), exist_ok=True)
    preds.to_csv(dump_path, index=False)

    gate_pop = preds[preds["is_seeded"]]
    counts.update({
        "eval_rows_all": int(len(preds)),
        "eval_rows_seeded": int(len(gate_pop)),
        "eval_players_seeded": int(gate_pop["player_id"].nunique()),
        "eval_rows_newcomer_diag": int((~preds["is_seeded"]).sum()),
        "eval_rows_capped": int((gate_pop["prior_starts"] >= G1_MIN_PRIOR_STARTS).sum()),
        "eval_players_capped": int(
            gate_pop[gate_pop["prior_starts"] >= G1_MIN_PRIOR_STARTS]["player_id"].nunique()),
    })

    floor = seed_season_floor(seeded)
    g1 = evaluate_g1(gate_pop)
    g0 = evaluate_g0(gate_pop, floor, g1["winner"])

    picks = {arm: top_picks(gate_pop, arm) for arm in ("S", "H", "V")}
    g2_ok, g2_reasons = evaluate_g2(picks[g1["winner"]])
    g2 = {
        "arm": g1["winner"], "passes": g2_ok, "reasons": g2_reasons,
        "picks": {a: p.to_dict("records") for a, p in picks.items()},
    }
    for arm in ("S", "H", "V"):
        ok, why = evaluate_g2(picks[arm])
        g2[f"{arm}_passes"] = ok
        g2[f"{arm}_reasons"] = why
    # Inclusive diagnostic: what the guard says if the (contaminated) unseeded
    # population is allowed into the ranking pool.
    incl_ok, incl_why = evaluate_g2(top_picks(preds, g1["winner"]))
    g2["inclusive_passes"] = incl_ok
    g2["inclusive_reasons"] = incl_why

    if not g0["passes"] or not g2["passes"]:
        verdict = "SHIP NOTHING"
    else:
        verdict = f"SHIP {g1['winner']}"

    # Newcomer-path diagnostic, explicitly outside the gate.
    nc = preds[~preds["is_seeded"]]
    diag = {"n": int(len(nc))}
    if len(nc):
        for arm in ("S", "H"):
            diag[f"{arm}_mae"] = mae(nc[f"{arm}_p50"], nc["actual"])
        diag["floor_mae"] = mae(_floor_series(nc, floor), nc["actual"])

    root, ext = os.path.splitext(dump_path)
    pd.concat(picks.values()).to_csv(f"{root}.picks{ext}", index=False)

    results = {"counts": counts, "g0": g0, "g1": g1, "g2": g2,
               "newcomer_diag": diag, "verdict": verdict}
    write_report_seed(results, report_path)
    return results


def _picks_table(records: list[dict]) -> str:
    head = ("| GW | top pick | pos | prior starts | pred | actual |\n"
            "|---|---|---|---|---|---|\n")
    return head + "".join(
        f"| {int(r['gw'])} | {r['web_name']} ({int(r['player_id'])}) | {r['position']} "
        f"| {r['prior_starts']:.1f} | {r['p50']:.2f} | {r['actual']:.0f} |\n"
        for r in records)


def write_report_seed(results: dict, path: str = REPORT_PATH) -> None:
    """Appends below MARKER. TRUNCATES FROM MARKER TO EOF — anything
    hand-written below it is destroyed on a re-run. Re-add it afterwards."""
    c, g0, g1, g2 = results["counts"], results["g0"], results["g1"], results["g2"]
    nc = results["newcomer_diag"]
    consts = " · ".join(f"{k} {v:.3f}" for k, v in g0["constants"].items())
    seasons = " + ".join(SEED_SEASONS)
    by_season = ", ".join(f"{k} {v}" for k, v in sorted(c["seed_rows_by_season"].items()))
    ok = {True: "✅ PASS", False: "❌ FAIL"}
    g2_why = "" if g2["passes"] else "\n\n" + "\n".join("- " + r for r in g2["reasons"])
    nc_line = ("none." if not nc["n"] else
               f"S {nc['S_mae']:.4f} · H {nc['H_mae']:.4f} · floor {nc['floor_mae']:.4f}.")
    section = f"""{MARKER}

# xPts GW1 seeding — Stage 1 gate (#212)

**Candidate model version:** `{SEED_MODEL_VERSION}` · frozen v1 coefficients
(`model/artifacts/xpts-v1.json`), unchanged feature builder.
Spec: `docs/superpowers/specs/2026-07-27-xpts-gw1-seeding-design.md` §7.

Seed from 2024/25 (0.7) + 2023/24 (0.3) → predict 2025/26 GW1–5 → score against
`player_gw_history` actuals.

| arm | definition |
|---|---|
| **S** | seeded pseudo-rows → frozen v1 coefficients |
| **H** | `0.7·(total_points(2024/25)/38) + 0.3·(total_points(2023/24)/38)` |
| **V** | real v1 on its 1–4 rows of history — *what ships today*, GW2–5 only |

## Sample sizes

| stage | n |
|---|---|
| `player_season_history` rows loaded ({seasons}) | {c['seed_rows_loaded']} ({by_season}) |
| distinct seed codes | {c['seed_codes_loaded']} |
| after the code → 2025/26 element-id join | {c['seed_codes_joined']} (dropped {c['seed_codes_dropped']}) |
| 2025/26 GW1–5 history rows / players | {c['history_rows_gw1_5']} / {c['history_players_gw1_5']} |
| **gate population** (seeded) rows / players | **{c['eval_rows_seeded']} / {c['eval_players_seeded']}** |
| after `prior_starts ≥ {G1_MIN_PRIOR_STARTS}` (G1 binding) rows / players | **{c['eval_rows_capped']} / {c['eval_players_capped']}** |
| unseeded rows (k-NN diagnostic, outside the gate) | {c['eval_rows_newcomer_diag']} |

## G0 — floor

Per-position constant = mean per-fixture points over **{seasons} only**
(never the 2025/26 eval window): {consts}.

| | MAE (capped) |
|---|---|
| winning arm **{g0['winner']}** | **{g0['winner_mae']:.4f}** |
| per-position constant floor | {g0['floor_mae']:.4f} |
| margin (floor − winner) | {g0['margin']:+.4f} |

**G0: {ok[g0['passes']]}**

## G1 — binding MAE

Capped population = prior-season `starts ≥ {G1_MIN_PRIOR_STARTS}` (n = {g1['n_capped']} rows,
{g1['n_players_capped']} players). Uncapped = all seeded rows (n = {g1['n_uncapped']}).

| arm | MAE (capped) | MAE (uncapped) |
|---|---|---|
| S | {g1['S_mae']:.4f} | {g1['S_mae_uncapped']:.4f} |
| H | {g1['H_mae']:.4f} | {g1['H_mae_uncapped']:.4f} |

**Winner: {g1['winner']}** (margin {g1['margin']:.4f}; ties go to H).

### Arm V — is GW2–6 fixed too?

V is undefined at GW1. Scored on its defined subset only, with S and H re-scored
on that **same** subset (n = {g1['n_v_capped']} capped / {g1['n_v_uncapped']} uncapped rows).

| arm | MAE (capped, V subset) | MAE (uncapped, V subset) |
|---|---|---|
| S | {g1['v_subset_S_mae']:.4f} | {g1['v_subset_S_mae_uncapped']:.4f} |
| H | {g1['v_subset_H_mae']:.4f} | {g1['v_subset_H_mae_uncapped']:.4f} |
| V | {g1['v_subset_V_mae']:.4f} | {g1['v_subset_V_mae_uncapped']:.4f} |

Winner beats V (today's behaviour) at GW2–5: **{g1['beats_v']}**

## G2 — pathology guard

Top-ranked pick per gameweek over the **uncapped** seeded population. Must never
be a GKP and must carry prior-season `starts ≥ {G2_MIN_STARTS}`.

Arm {g2['arm']} (the winner):

{_picks_table(g2['picks'][g2['arm']])}
**G2: {ok[g2['passes']]}**{g2_why}

Per-arm: S {ok[g2['S_passes']]} · H {ok[g2['H_passes']]} · V {ok[g2['V_passes']]}.
With the unseeded rows allowed into the ranking pool: {ok[g2['inclusive_passes']]}.

## Verdict

**{results['verdict']}**

| criterion | outcome |
|---|---|
| G0 floor | {ok[g0['passes']]} |
| G1 binding | winner **{g1['winner']}** — {g1['S_mae']:.4f} (S) vs {g1['H_mae']:.4f} (H) |
| G2 guard | {ok[g2['passes']]} |

Unseeded (k-NN newcomer path) diagnostic, **outside the gate** — n = {nc['n']}:
{nc_line}
Most of that population is not actually newcomers (see the diagnostics below).
"""
    with open(path) as f:
        content = f.read()
    if content.count(MARKER) > 1:
        raise ValueError("duplicate xpts-seed marker in report — refusing to write")
    if MARKER in content:
        content = content[: content.index(MARKER)].rstrip() + "\n"
    with open(path, "w") as f:
        f.write(content.rstrip() + "\n\n" + section)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("usage: python backtest_seed.py <dump.csv>  "
                         "(always pass the dump path)")
    r = run_gate(sys.argv[1])
    c, g0, g1, g2 = r["counts"], r["g0"], r["g1"], r["g2"]
    print(f"[backtest-seed] seeds {c['seed_rows_loaded']} rows / "
          f"{c['seed_codes_loaded']} codes -> joined {c['seed_codes_joined']} -> "
          f"gate pop {c['eval_rows_seeded']} rows ({c['eval_players_seeded']} players) "
          f"-> capped {c['eval_rows_capped']} rows ({c['eval_players_capped']} players)")
    print(f"[backtest-seed] G0 floor {g0['floor_mae']:.4f} vs {g0['winner']} "
          f"{g0['winner_mae']:.4f} PASS={g0['passes']}")
    print(f"[backtest-seed] G1 S {g1['S_mae']:.4f} / H {g1['H_mae']:.4f} "
          f"(uncapped S {g1['S_mae_uncapped']:.4f} / H {g1['H_mae_uncapped']:.4f}) "
          f"winner={g1['winner']}")
    print(f"[backtest-seed] G1 V-subset S {g1['v_subset_S_mae']:.4f} / "
          f"H {g1['v_subset_H_mae']:.4f} / V {g1['v_subset_V_mae']:.4f} "
          f"beats_v={g1['beats_v']}")
    print(f"[backtest-seed] G2 PASS={g2['passes']} {g2['reasons']}")
    print(f"[backtest-seed] VERDICT {r['verdict']}")
