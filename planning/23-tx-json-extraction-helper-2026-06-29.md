# 23 — Tx JSON extraction helper

Date: 2026-06-29

## Increment

Added `scripts/extract_juno_v1_tx_sets.py`, a small operator helper for the Astroport-Juno v1 uni-7 deployment handoff.

It parses common `junod -o json` tx response shapes and extracts:

- wasm upload `code_id` attributes into `--set code_ids.<name>=...` flags;
- instantiate `_contract_address` / `contract_address` attributes into `--set addresses.<name>=...` flags;
- unmapped `--scan` output for unfamiliar tx JSON before assigning names.

Also linked the helper from `deployment/README.md` so operators have the path from tx logs to `fill_juno_v1_deployment_config.py`.

## Verification

```text
$ python3 scripts/extract_juno_v1_tx_sets.py --code-id astroport-factory=target/juno-v1-store-sample.json --address astroport-factory=target/juno-v1-instantiate-sample.json
--set code_ids.astroport-factory='77'
--set addresses.astroport-factory='juno1factory000000000000000000000000000000000'

$ python3 scripts/extract_juno_v1_tx_sets.py --scan target/juno-v1-store-sample.json target/juno-v1-instantiate-sample.json
# target/juno-v1-store-sample.json
code_ids=77
addresses=-
# target/juno-v1-instantiate-sample.json
code_ids=-
addresses=juno1factory000000000000000000000000000000000

$ python3 scripts/extract_juno_v1_tx_sets.py --code-id not-a-contract=target/juno-v1-store-sample.json >/tmp/juno-bad-key.out 2>/tmp/juno-bad-key.err; test $? -ne 0
```

## Next bounded slice

Add a tiny fixture-based test command for `extract_juno_v1_tx_sets.py` to CI, or use it against the first real uni-7 upload tx outputs when they exist.
