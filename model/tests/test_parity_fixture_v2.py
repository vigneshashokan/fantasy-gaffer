"""Freshness guard: the committed parity-fixture v2 block must equal a fresh
build_v2_cases() run. Fails if match_engine/features_v2/feature_spec_v2 or the
v2 artifact change without regenerating the fixture (emit_parity_fixture.py)."""
import json
import os

from emit_parity_fixture import build_v2_cases

_FIXTURE = os.path.join(os.path.dirname(__file__), "..", "artifacts", "parity-fixture.json")


def test_committed_v2_block_is_fresh():
    with open(_FIXTURE) as f:
        committed = json.load(f)["v2"]
    fresh = json.loads(json.dumps(build_v2_cases()))  # normalize via JSON round-trip
    assert committed == fresh, (
        "parity-fixture.json v2 block is stale — re-run emit_parity_fixture.py"
    )
