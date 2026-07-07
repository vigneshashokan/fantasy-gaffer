"""The v3 generative simulator (#129, spec §3d–§3f). Pure; no I/O.

One call simulates one player-fixture into N event/total draw arrays. DGW
callers sum the returned arrays elementwise across the player's fixtures
BEFORE calling summarize_draws — quantiles of a sum, never a sum of
quantiles."""
from __future__ import annotations

import numpy as np

from feature_spec_v3 import (CS_POINTS, LAMBDA_CAP, M_FULL, M_PART, N_SIMS,
                             SAVES_LAMBDA_CAP)
from points_rules import score_draws


def simulate_player_fixture(rng: np.random.Generator, position: str,
                            p_play: float, p60: float, player: dict,
                            lam_against: float, m_att: float, m_sav: float,
                            n: int = N_SIMS) -> dict:
    """player = build_player_rates output ({"rates", "p_dc", "bonus"}).
    Returns {"total", "goals", "assists", "cs"} int arrays of length n."""
    r = player["rates"]
    u = rng.random(n)
    played = u >= (1.0 - p_play)   # P = p_play
    full = u >= (1.0 - p60)        # P = p60; full ⊆ played since p60 <= p_play
    mins = np.where(full, M_FULL, np.where(played, M_PART, 0.0))
    f = mins / 90.0

    def lam(rate: float, mult: float, cap: float = LAMBDA_CAP) -> np.ndarray:
        # spec §3b: clip the FINAL per-fixture lambda (post-adjustment, post-scaling)
        return np.clip(rate * mult * f, 0.0, cap)

    goals = rng.poisson(lam(r["xg90"], m_att))
    assists = rng.poisson(lam(r["xa90"], m_att))
    gc_on = rng.poisson(np.clip(lam_against * f, 0.0, LAMBDA_CAP))
    saves = rng.poisson(lam(r["saves90"], m_sav, cap=SAVES_LAMBDA_CAP))
    pen_saved = rng.poisson(lam(r["ps90"], m_sav))
    pen_missed = rng.poisson(lam(r["pm90"], 1.0))
    yellow = (rng.random(n) < np.minimum(r["yc90"] * f, 1.0)).astype(np.int64)
    red = (rng.random(n) < np.minimum(r["rc90"] * f, 1.0)).astype(np.int64)
    own_goals = rng.poisson(lam(r["og90"], 1.0))
    dc_hit = (full & (rng.random(n) < player["p_dc"])).astype(np.int64)
    bonus = np.where(played, rng.choice(4, size=n, p=np.asarray(player["bonus"])), 0)
    cs = (full & (gc_on == 0)).astype(np.int64)

    ev = {"played": played, "full": full, "goals": goals, "assists": assists,
          "gc_on": gc_on, "cs": cs, "saves": saves, "pen_saved": pen_saved,
          "pen_missed": pen_missed, "yellow": yellow, "red": red,
          "own_goals": own_goals, "dc_hit": dc_hit, "bonus": bonus}
    return {"total": score_draws(position, ev), "goals": goals,
            "assists": assists, "cs": cs}


def summarize_draws(arrs: dict, position: str) -> dict:
    """Point estimate + contract quantiles + intermediate probabilities from
    (possibly DGW-summed) draw arrays."""
    total = arrs["total"]
    q25, q50, q75 = np.quantile(total, [0.25, 0.50, 0.75], method="linear")
    return {
        "mean_v3": float(total.mean()),
        "p25_v3": float(q25), "p50_v3": float(q50), "p75_v3": float(q75),
        "p_goal": float((arrs["goals"] >= 1).mean()),
        "p_assist": float((arrs["assists"] >= 1).mean()),
        "p_cs_pts": float((arrs["cs"] >= 1).mean()) if CS_POINTS[position] > 0 else 0.0,
        "p_haul": float((total >= 10).mean()),
    }
