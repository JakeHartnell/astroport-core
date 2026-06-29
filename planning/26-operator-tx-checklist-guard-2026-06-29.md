# 26 — Operator tx checklist guard

Date: 2026-06-29

## Increment

Added a guarded operator checklist for the uni-7 Astroport-Juno v1 deployment handoff. The checklist names the exact 16 transaction JSON files expected after `junod -o json` upload/instantiate work:

- 9 store tx files for v1 code IDs: factory, incentives, native coin registry, oracle, pair, router, tokenfactory tracker, whitelist, and `cw20-base`.
- 7 instantiate tx files for v1 contract addresses: factory, incentives, native coin registry, oracle, router, tokenfactory tracker, and whitelist.

Added `scripts/check_juno_v1_operator_checklist.py`, a dependency-free guard that verifies the checklist stays aligned with `scripts/extract_juno_v1_tx_sets.py`, `scripts/build_juno_v1_deployment_command.py`, the deployment README link, the required 5 manual operator values, and the narrow v1 scope guardrail.

Wired the checklist guard into `.github/workflows/tests_and_checks.yml` before Rust setup and extended `scripts/check_juno_v1_ci_wiring.py` so CI fails if the guard is removed or reordered after expensive Rust work. Also ignored local deployment tx JSON and rendered `deployment/juno-v1-testnet.json` to reduce the chance that real tx output or environment-specific config is committed accidentally.

## Verification

```text
$ python3 scripts/check_juno_v1_operator_checklist.py && python3 scripts/check_juno_v1_ci_wiring.py && python3 scripts/check_juno_v1_deployment_command.py && python3 scripts/check_juno_v1_tx_extractor.py && python3 scripts/check_juno_v1_deployment_template.py && python3 scripts/check_juno_v1_scope.py && python3 scripts/check_juno_v1_schemas.py
OK: Juno v1 operator tx checklist matches deployment helpers
store_txs=9 instantiate_txs=7 manual_values=5
OK: GitHub Actions wiring enforces Astroport-Juno v1 guards
tests_guards=scope/schema/template/tx-extractor/deployment-command/operator-checklist pre_rust=true schema_post_generation=true artifact_guard_after_size=true
OK: Juno v1 deployment command builder combines tx sets and manual values
sets=21 tx_sets=16 manual_sets=5 render_guard=true failure_cases=1
OK: Juno v1 tx extractor handles mapped, scan, raw_log, and failure cases
fixtures=4 mapped_sets=3 failure_cases=2
OK: Juno v1 deployment template matches instantiate schema requirements
instantiate_msgs=7 code_ids=9 addresses=7 pair_type=xyk
OK: Astroport-Juno v1 scope matches Cargo.toml and planning/01-strip-list.md
workspace_members=13 expected_wasms=8
OK: committed schemas match Astroport-Juno v1 contract set
schema_dirs=8 expected=8
```

`git diff --check` produced no output for the touched files.

## Next bounded slice

Add a tiny dry-run tx fixture generator for the 16 expected uni-7 tx JSON files so operators can rehearse the full extractor → bundle → render flow without real chain txs, then replace fixtures with actual uni-7 outputs when available.
