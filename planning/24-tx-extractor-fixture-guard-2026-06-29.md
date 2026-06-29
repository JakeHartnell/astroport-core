# 24 — Tx extractor fixture guard

Date: 2026-06-29

## Increment

Added `scripts/check_juno_v1_tx_extractor.py`, a dependency-free fixture guard for the deployment tx parser.

The guard exercises the operator handoff path before any live uni-7 outputs exist:

- maps a `tx_response.events` wasm upload `code_id` into `--set code_ids.astroport-factory=...`;
- maps instantiate addresses from both `logs[].events` and JSON-encoded `raw_log` shapes;
- verifies unmapped `--scan` output surfaces discovered code IDs/addresses;
- verifies failure behavior for unknown contract keys and ambiguous multi-code tx files.

Wired this guard into `.github/workflows/tests_and_checks.yml` before Rust setup, and extended `scripts/check_juno_v1_ci_wiring.py` so CI fails if the tx extractor guard is removed or moved after expensive Rust work.

## Verification

```text
$ python3 scripts/check_juno_v1_tx_extractor.py && python3 scripts/check_juno_v1_ci_wiring.py && python3 scripts/check_juno_v1_deployment_template.py && python3 scripts/check_juno_v1_scope.py && python3 scripts/check_juno_v1_schemas.py && git diff --check -- .github/workflows/tests_and_checks.yml scripts/check_juno_v1_ci_wiring.py scripts/check_juno_v1_tx_extractor.py
OK: Juno v1 tx extractor handles mapped, scan, raw_log, and failure cases
fixtures=4 mapped_sets=3 failure_cases=2
OK: GitHub Actions wiring enforces Astroport-Juno v1 guards
tests_guards=scope/schema/template/tx-extractor pre_rust=true schema_post_generation=true artifact_guard_after_size=true
OK: Juno v1 deployment template matches instantiate schema requirements
instantiate_msgs=7 code_ids=9 addresses=7 pair_type=xyk
OK: Astroport-Juno v1 scope matches Cargo.toml and planning/01-strip-list.md
workspace_members=13 expected_wasms=8
OK: committed schemas match Astroport-Juno v1 contract set
schema_dirs=8 expected=8
```

`git diff --check` produced no output.

## Next bounded slice

Add a dry-run deployment value bundle/checklist that combines extractor output plus accounts/counterparty denom into one render command, or run the extractor against the first real uni-7 upload/instantiate tx JSON when available.
