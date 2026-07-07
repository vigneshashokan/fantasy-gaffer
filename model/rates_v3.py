"""Walk-forward per-player event rates for the v3 simulator (#129, spec §3b).
Pure; no I/O. Every quantity is computed from prior (gw < t) rows only —
callers are responsible for passing pre-filtered frames."""
from __future__ import annotations

import numpy as np
import pandas as pd

from feature_spec_v3 import (BONUS_PSEUDO, DC_THRESHOLD, MIN_DECAYED_MINUTES,
                             RATE_ALPHA, RATE_WINDOW)

# rate name -> history column holding the per-fixture event count/value
RATE_COLUMNS = {
    "xg90": "expected_goals",
    "xa90": "expected_assists",
    "saves90": "saves",
    "yc90": "yellow_cards",
    "rc90": "red_cards",
    "og90": "own_goals",
    "pm90": "penalties_missed",
    "ps90": "penalties_saved",
}

_EMPTY_PRIOR = {"rates": {name: 0.0 for name in RATE_COLUMNS},
                "p_dc": 0.0, "bonus": np.array([1.0, 0.0, 0.0, 0.0])}


def _dc_hits(rows: pd.DataFrame) -> pd.Series:
    thresh = rows["position"].map(DC_THRESHOLD)
    return thresh.notna() & (rows["defensive_contribution"] >= thresh.fillna(10 ** 9))


def position_rate_priors(past: pd.DataFrame) -> dict:
    """Pooled per-position fallbacks from all played gw<t rows: unweighted
    rate90s (90·Σx/Σminutes), p_dc among 60+' rows, bonus distribution."""
    priors: dict[str, dict] = {}
    played = past[past["minutes"] >= 1]
    for pos, g in played.groupby("position"):
        mins = float(g["minutes"].sum())
        rates = {name: (90.0 * float(g[col].sum()) / mins if mins > 0 else 0.0)
                 for name, col in RATE_COLUMNS.items()}
        qual = g[g["minutes"] >= 60]
        p_dc = 0.0 if pos == "GKP" else (
            float(_dc_hits(qual).mean()) if len(qual) else 0.0)
        counts = np.array([float((g["bonus"] == k).sum()) for k in range(4)])
        bonus = counts / counts.sum() if counts.sum() > 0 else np.array([1.0, 0, 0, 0])
        priors[pos] = {"rates": rates, "p_dc": p_dc, "bonus": bonus}
    return priors


def build_player_rates(prior_rows: pd.DataFrame, position: str, priors: dict) -> dict:
    """Rates from the player's last RATE_WINDOW *played* prior rows, falling
    back to the position prior when decayed minutes < MIN_DECAYED_MINUTES."""
    pos_prior = priors.get(position, _EMPTY_PRIOR)
    played = (prior_rows[prior_rows["minutes"] >= 1]
              .sort_values(["gw", "fixture_id"], ascending=False)
              .head(RATE_WINDOW))
    w = RATE_ALPHA ** np.arange(len(played))
    denom = float(np.dot(w, played["minutes"].to_numpy(dtype=float))) if len(played) else 0.0
    if denom < MIN_DECAYED_MINUTES:
        rates = dict(pos_prior["rates"])
    else:
        rates = {name: 90.0 * float(np.dot(w, played[col].to_numpy(dtype=float))) / denom
                 for name, col in RATE_COLUMNS.items()}

    if position == "GKP":
        p_dc = 0.0
    else:
        qual = (prior_rows[prior_rows["minutes"] >= 60]
                .sort_values(["gw", "fixture_id"], ascending=False)
                .head(RATE_WINDOW))
        if len(qual):
            wq = RATE_ALPHA ** np.arange(len(qual))
            p_dc = float(np.dot(wq / wq.sum(), _dc_hits(qual).to_numpy(dtype=float)))
        else:
            p_dc = pos_prior["p_dc"]

    counts = np.zeros(4)
    if len(played):
        b = played["bonus"].to_numpy()
        for k in range(4):
            counts[k] = float(w[b == k].sum())
    smoothed = counts + BONUS_PSEUDO * np.asarray(pos_prior["bonus"], dtype=float)
    bonus = smoothed / smoothed.sum()
    return {"rates": rates, "p_dc": p_dc, "bonus": bonus}
