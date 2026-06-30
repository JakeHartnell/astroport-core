# 29 — Deployment artifact gitignore guard

Date: 2026-06-29T07:44:26Z

## Increment

Added a cheap safety guard for the Astroport-Juno v1 uni-7 handoff local artifacts:

- `scripts/check_juno_v1_deployment_gitignore.py` verifies `.gitignore` keeps `deployment/tx/` and `deployment/juno-v1-testnet.json` ignored.
- The guard uses `git check-ignore --no-index` against representative real and dry-run tx paths, confirms no `deployment/tx/` or rendered `deployment/juno-v1-testnet.json` artifacts are tracked, and ensures the dry-run generator default stays under ignored `deployment/tx/`.
- `.github/workflows/tests_and_checks.yml` now runs the guard in the pre-Rust launch-guard sequence.
- `scripts/check_juno_v1_ci_wiring.py` now fails if the deployment gitignore guard disappears or moves after Rust setup.

This reduces launch risk by keeping operator tx JSON and rendered configs local until stewards intentionally publish final uni-7 values.

## Verification

```text
$ python3 scripts/check_juno_v1_deployment_gitignore.py && python3 scripts/check_juno_v1_ci_wiring.py && python3 scripts/check_juno_v1_dry_run_txs.py && python3 scripts/check_juno_v1_operator_checklist.py && python3 scripts/check_juno_v1_deployment_command.py && python3 scripts/check_juno_v1_tx_extractor.py && python3 scripts/check_juno_v1_deployment_template.py && python3 scripts/check_juno_v1_scope.py && python3 scripts/check_juno_v1_schemas.py && git diff --check -- scripts/check_juno_v1_deployment_gitignore.py scripts/check_juno_v1_ci_wiring.py .github/workflows/tests_and_checks.yml
OK: Juno v1 deployment tx/output paths stay gitignored
ignored_paths=5 tracked_artifacts=0 generator_default=deployment/tx/uni-7-dry-run
OK: GitHub Actions wiring enforces Astroport-Juno v1 guards
tests_guards=scope/schema/template/tx-extractor/deployment-command/operator-checklist pre_rust=true dry_run_txs=true deployment_gitignore=true schema_post_generation=true artifact_guard_after_size=true
OK: Juno v1 dry-run tx fixtures exercise generator -> extractor -> builder -> template guard
fixture_files=16 tx_sets=16 render_guard=true
store_txs=9 instantiate_txs=7 total=16
OK: Juno v1 operator tx checklist matches deployment helpers
store_txs=9 instantiate_txs=7 manual_values=5
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

`git diff --check` produced no output.

## Next bounded slice

Add a small frontend config sanity guard that reads a rendered deployment config and verifies the frontend-facing `addresses` + first XYK pair template are internally consistent without needing chain access.
