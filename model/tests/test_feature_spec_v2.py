from feature_spec_v2 import (
    DECAY_ALPHA_V2,
    FEATURE_COLUMNS_V2,
    FORM_STATS_V2,
    FORM_WINDOW_V2,
    LEAGUE_XG_PRIOR,
    MODEL_VERSION_V2,
    PRIOR_WEIGHT,
    QUANTILES_V2,
    RATING_ALPHA,
    RATING_WINDOW,
    VALUE_SCALE_V2,
)


def test_model_version():
    assert MODEL_VERSION_V2 == "v2.0.0"


def test_form_stats_drop_xgi_only():
    # v1 FORM_STATS minus expected_goal_involvements, order preserved.
    assert FORM_STATS_V2 == [
        "expected_goals", "expected_assists", "threat", "creativity",
        "influence", "bps", "defensive_contribution", "total_points",
    ]


def test_feature_columns_exact_order():
    # SERVING CONTRACT (#128 mirrors this order) — change breaks the artifact.
    assert FEATURE_COLUMNS_V2 == [
        "form_expected_goals", "form_expected_assists", "form_threat",
        "form_creativity", "form_influence", "form_bps",
        "form_defensive_contribution", "form_total_points",
        "xmin", "was_home", "value_scaled",
        "team_lambda_for", "team_lambda_against", "p_clean_sheet",
    ]
    assert len(FEATURE_COLUMNS_V2) == 14


def test_no_static_strengths_or_xgi():
    assert "opp_strength_def" not in FEATURE_COLUMNS_V2
    assert "opp_strength_att" not in FEATURE_COLUMNS_V2
    assert "form_expected_goal_involvements" not in FEATURE_COLUMNS_V2


def test_hyperparams_sane():
    assert RATING_WINDOW >= 1
    assert 0.0 < RATING_ALPHA <= 1.0
    assert PRIOR_WEIGHT > 0
    assert 0.5 < LEAGUE_XG_PRIOR < 3.0
    assert FORM_WINDOW_V2 == 6 and DECAY_ALPHA_V2 == 0.85  # unchanged from v1
    assert QUANTILES_V2 == [0.25, 0.50, 0.75] and VALUE_SCALE_V2 == 10.0
