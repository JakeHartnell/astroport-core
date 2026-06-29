# 25 — Deployment command bundle

Date: 2026-06-29

## Increment

Added `scripts/build_juno_v1_deployment_command.py`, a dependency-free handoff helper that combines:

- tx-derived `--set` lines from `scripts/extract_juno_v1_tx_sets.py` for the 9 v1 code IDs and 7 instantiated contract addresses; and
- manual operator values for `owner`, `guardian`, `treasury`, tokenfactory module address, and the first counterparty denom in the sample XYK pair-create template.

The helper prints one copy/paste-safe `scripts/fill_juno_v1_deployment_config.py --require-complete` command. With `--render`, it executes that command and immediately validates the rendered config through `scripts/check_juno_v1_deployment_template.py`.

Added `scripts/check_juno_v1_deployment_command.py` to fixture-test the happy path, render+guard path, and missing tx-value failure. Wired it into `.github/workflows/tests_and_checks.yml` before Rust setup, and extended `scripts/check_juno_v1_ci_wiring.py` so CI fails if this handoff guard is removed or reordered after expensive Rust work.

## Verification

```text
$ python3 scripts/check_juno_v1_deployment_command.py && python3 scripts/check_juno_v1_ci_wiring.py && python3 scripts/check_juno_v1_tx_extractor.py && python3 scripts/check_juno_v1_deployment_template.py && python3 scripts/check_juno_v1_scope.py && python3 scripts/check_juno_v1_schemas.py && git diff --check -- .github/workflows/tests_and_checks.yml scripts/check_juno_v1_ci_wiring.py scripts/build_juno_v1_deployment_command.py scripts/check_juno_v1_deployment_command.py
OK: Juno v1 deployment command builder combines tx sets and manual values
sets=21 tx_sets=16 manual_sets=5 render_guard=true failure_cases=1
OK: GitHub Actions wiring enforces Astroport-Juno v1 guards
tests_guards=scope/schema/template/tx-extractor/deployment-command pre_rust=true schema_post_generation=true artifact_guard_after_size=true
OK: Juno v1 tx extractor handles mapped, scan, raw_log, and failure cases
fixtures=4 mapped_sets=3 failure_cases=2
OK: Juno v1 deployment template matches instantiate schema requirements
instantiate_msgs=7 code_ids=9 addresses=7 pair_type=xyk
OK: Astroport-Juno v1 scope matches Cargo.toml and planning/01-strip-list.md
workspace_members=13 expected_wasms=8
OK: committed schemas match Astroport-Juno v1 contract set
schema_dirs=8 expected=8
```

`git diff --check` produced no output.

## Next bounded slice

Use the bundle helper against the first real uni-7 upload/instantiate tx JSON, or add a tiny operator checklist that names the expected tx JSON filenames for all 16 tx-derived values.
