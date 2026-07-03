# First-pool smoke txhash format guard

Date: 2026-07-03

## Increment

Tightened the offline first-pool smoke evidence validator so each saved broadcast
response must carry a real `junod`-style 64-character hex tx hash. Placeholder
strings like `TINYSWAP123` now fail before an operator can use the evidence to
justify opening public XYK pair creation.

## Files

- `scripts/validate_juno_v1_first_pool_smoke_evidence.py`
- `scripts/check_juno_v1_first_pool_smoke_evidence.py`
- `deployment/README.md`
- `deployment/operator-tx-checklist.md`

## Verification

- `python3 scripts/check_juno_v1_first_pool_smoke_evidence.py`
- `python3 scripts/check_juno_v1_operator_checklist.py`
- `python3 scripts/check_juno_v1_deployment_readme.py`
- `python3 scripts/check_juno_v1_ci_wiring.py`
- `git diff --check -- scripts/validate_juno_v1_first_pool_smoke_evidence.py scripts/check_juno_v1_first_pool_smoke_evidence.py deployment/README.md deployment/operator-tx-checklist.md planning/00-overview.md planning/48-first-pool-smoke-txhash-format-2026-07-03.md`

## Result

The launch gate now rejects fake or truncated tx hashes, in addition to failed
tx codes, duplicate tx hashes, out-of-order heights, wrong pool denoms, zero
liquidity, and unchanged post-swap pool state.
