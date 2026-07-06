"""Freshness guard: the committed parity-fixture v21 block must equal a fresh
build_v21_cases() run. Fails if minutes_model/features_v21/feature_spec_v21 or
the v21 artifact change without re-running emit_parity_fixture.py."""
import json
import os

from emit_parity_fixture import build_v21_cases

_FIXTURE = os.path.join(os.path.dirname(__file__), "..", "artifacts",
                        "parity-fixture.json")


def test_committed_v21_block_is_fresh():
    with open(_FIXTURE) as f:
        committed = json.load(f)["v21"]
    fresh = json.loads(json.dumps(build_v21_cases()))  # normalize via JSON round-trip
    assert committed == fresh, (
        "parity-fixture.json v21 block is stale — re-run emit_parity_fixture.py"
    )
