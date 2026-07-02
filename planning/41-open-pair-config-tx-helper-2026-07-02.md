# 41 — Post-smoke open-XYK tx helper

Date: 2026-07-02

## Slice

Added a bounded operator helper for the exact post-smoke launch-gate removal tx:
`scripts/build_juno_v1_open_pair_config_tx.py` reads a rendered deployment config
and emits the guarded `update_pair_config` message plus `junod tx wasm execute`
command that opens public XYK pair creation.

## Why

The first-pool launch gate intentionally keeps factory XYK pair creation
`permissioned=true` until the official first pool is registered, seeded, and
smoke-checked. The final open step is small but risky if copied by hand: wrong
factory address, wrong chain ID, wrong pair code ID, or accidentally changing fee
settings can break launch trust. Generating it from the rendered config reduces
that operator risk without expanding v1 scope.

## Guardrails

- Reads `addresses.astroport-factory` and `network.chain_id` from the rendered
  config.
- Uses `post_update_state.astroport-factory.pair_configs[0]` for the final
  `permissioned=false` XYK config.
- Verifies the instantiate config started `permissioned=true` and the post-update
  config preserves code ID, pair type, fees, disabled flags, and whitelist except
  for the permissioned flip.
- Verifies the post-update code ID matches `code_ids.astroport-pair`.
- Writes no tx output itself; it prints the command and default ignored output
  path `deployment/tx/<chain-id>/update-pair-config-open-xyk.json`.

## Verification

```sh
python3 scripts/check_juno_v1_open_pair_config_tx.py
python3 scripts/check_juno_v1_operator_checklist.py
python3 scripts/check_juno_v1_deployment_readme.py
python3 scripts/check_juno_v1_ci_wiring.py
git diff --check -- scripts/build_juno_v1_open_pair_config_tx.py scripts/check_juno_v1_open_pair_config_tx.py deployment/operator-tx-checklist.md deployment/README.md .github/workflows/tests_and_checks.yml scripts/check_juno_v1_ci_wiring.py scripts/check_juno_v1_operator_checklist.py scripts/check_juno_v1_deployment_readme.py planning/00-overview.md planning/41-open-pair-config-tx-helper-2026-07-02.md
```

## Next bounded slice

Run the helper against the first real rendered uni-7 config after upload and
instantiate txs exist, then save the resulting broadcast JSON under
`deployment/tx/uni-7/update-pair-config-open-xyk.json` locally for handoff.
