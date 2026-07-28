"""Freshness guard: the committed parity-fixture seed block must equal a fresh
build_seed_cases() run. Fails if seed.py or seed_spec.py change without
re-running emit_parity_fixture.py."""
import json
import os

from emit_parity_fixture import build_seed_cases

_FIXTURE = os.path.join(os.path.dirname(__file__), "..", "artifacts", "parity-fixture.json")


def test_committed_seed_block_is_fresh():
    with open(_FIXTURE) as f:
        committed = json.load(f)["seed"]
    fresh = json.loads(json.dumps(build_seed_cases()))  # normalize via JSON round-trip
    assert committed == fresh, (
        "parity-fixture.json seed block is stale — re-run emit_parity_fixture.py"
    )
