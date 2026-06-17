# xPts v1 — offline model toolchain

Python, offline-only. Trains the per-position quantile-regression xPts model on
the backfilled `player_gw_history` and walk-forward backtests it. Excluded from
the repo's tsc/Jest — test with `pytest`.

## Setup

```bash
cd model
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

The local Supabase stack must be up and `player_gw_history` populated (Plan 1).

```bash
# Train on the full 2025/26 season -> model/artifacts/xpts-v1.json
python train.py

# Walk-forward backtest (GW 8..38) -> ../docs/xpts-model.md
python backtest.py
```

Override the DB with `DATABASE_URL` (default
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).

## Tests

```bash
cd model && source .venv/bin/activate && pytest -q
```
