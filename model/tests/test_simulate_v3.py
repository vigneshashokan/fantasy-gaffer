"""Simulator tests: determinism, quantile coherence, minutes gating,
analytic-mean parity (MID), the saves cap (GKP), and FWD p_cs_pts = 0."""
import math

import numpy as np
import pytest
from scipy.stats import poisson

from feature_spec_v3 import M_FULL, SAVES_LAMBDA_CAP
from simulate_v3 import simulate_player_fixture, summarize_draws


def player(**over):
    rates = {"xg90": 0.0, "xa90": 0.0, "saves90": 0.0, "yc90": 0.0, "rc90": 0.0,
             "og90": 0.0, "pm90": 0.0, "ps90": 0.0}
    rates.update({k: v for k, v in over.items() if k in rates})
    return {"rates": rates,
            "p_dc": over.get("p_dc", 0.0),
            "bonus": np.asarray(over.get("bonus", [1.0, 0.0, 0.0, 0.0]))}


def sim(seed=1, position="MID", p_play=1.0, p60=1.0, lam_against=1.0,
        m_att=1.0, m_sav=1.0, n=20000, **over):
    rng = np.random.default_rng(seed)
    return simulate_player_fixture(rng, position, p_play, p60, player(**over),
                                   lam_against, m_att, m_sav, n=n)


def test_same_seed_is_deterministic():
    a = sim(seed=7, xg90=0.6, yc90=0.2, p_dc=0.3, bonus=[0.7, 0.2, 0.05, 0.05])
    b = sim(seed=7, xg90=0.6, yc90=0.2, p_dc=0.3, bonus=[0.7, 0.2, 0.05, 0.05])
    assert np.array_equal(a["total"], b["total"])


def test_absent_player_scores_exactly_zero():
    out = sim(p_play=0.0, p60=0.0, xg90=2.0, lam_against=2.0)
    assert out["total"].max() == 0 and out["total"].min() == 0
    s = summarize_draws(out, "MID")
    assert s["mean_v3"] == 0.0 and s["p_goal"] == 0.0


def test_quantiles_are_monotone():
    out = sim(xg90=0.5, xa90=0.3, p_play=0.9, p60=0.7,
              bonus=[0.7, 0.2, 0.05, 0.05])
    s = summarize_draws(out, "MID")
    assert s["p25_v3"] <= s["p50_v3"] <= s["p75_v3"]


def test_analytic_mean_parity_mid():
    xg90, xa90, yc90, p_dc = 0.9, 0.4, 0.2, 0.3
    m_att, lam_against = 1.2, 1.0
    bonus = [0.7, 0.2, 0.05, 0.05]
    out = sim(xg90=xg90, xa90=xa90, yc90=yc90, p_dc=p_dc, m_att=m_att,
              lam_against=lam_against, bonus=bonus, n=200000)
    f = M_FULL / 90.0
    expected = (2.0                                   # appearance (always full)
                + xg90 * m_att * f * 5                # goals
                + xa90 * m_att * f * 3                # assists
                + math.exp(-lam_against * f) * 1      # MID clean sheet
                - min(yc90 * f, 1.0)                  # yellow
                + p_dc * 2                            # DC
                + np.dot(bonus, [0, 1, 2, 3]))        # bonus mean
    sd = out["total"].std()
    assert out["total"].mean() == pytest.approx(expected, abs=4 * sd / math.sqrt(200000))


def test_gkp_saves_not_clipped_at_goal_cap():
    # saves lambda = 3.2 * 1.5 * 85/90 = 4.53 — above LAMBDA_CAP, below SAVES_LAMBDA_CAP.
    lam = 3.2 * 1.5 * (M_FULL / 90.0)
    assert lam < SAVES_LAMBDA_CAP
    out = sim(position="GKP", saves90=3.2, m_sav=1.5, lam_against=0.0, n=200000)
    # lam_against=0 -> gc_on=0 every draw -> a certain clean sheet (+4 GKP).
    # E[total] = 2 appearance + 4 CS + E[floor(S/3)] with S ~ Poisson(lam).
    e_floor = sum((k // 3) * poisson.pmf(k, lam) for k in range(60))
    sd = out["total"].std()
    assert out["total"].mean() == pytest.approx(2.0 + 4.0 + e_floor,
                                                abs=4 * sd / math.sqrt(200000))


def test_fwd_p_cs_pts_is_zero():
    out = sim(position="FWD", lam_against=0.2, p_play=1.0, p60=1.0)
    s = summarize_draws(out, "FWD")
    assert s["p_cs_pts"] == 0.0


def test_partial_bucket_never_earns_cs():
    out = sim(p_play=1.0, p60=0.0, lam_against=0.0)  # always partial, never concedes
    assert out["cs"].max() == 0
