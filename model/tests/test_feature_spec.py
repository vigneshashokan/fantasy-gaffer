from feature_spec import FEATURE_COLUMNS, FORM_STATS, POSITIONS, QUANTILES


def test_feature_columns_cover_all_form_stats_plus_fixture_and_control():
    for s in FORM_STATS:
        assert f"form_{s}" in FEATURE_COLUMNS
    for extra in ["xmin", "opp_strength_def", "opp_strength_att", "was_home", "value_scaled"]:
        assert extra in FEATURE_COLUMNS
    # No duplicates.
    assert len(FEATURE_COLUMNS) == len(set(FEATURE_COLUMNS))


def test_positions_and_quantiles():
    assert POSITIONS == ["GKP", "DEF", "MID", "FWD"]
    assert QUANTILES == [0.25, 0.50, 0.75]
