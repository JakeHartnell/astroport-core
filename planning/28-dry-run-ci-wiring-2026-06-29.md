# 28 — Dry-run tx rehearsal CI wiring

Date: 2026-06-29T07:15:42Z

## Increment

Wired the Astroport-Juno v1 dry-run deployment rehearsal into the cheap pre-Rust GitHub Actions guard sequence.

Changed:

- `.github/workflows/tests_and_checks.yml` now runs `scripts/check_juno_v1_dry_run_txs.py` before the self-checking CI wiring guard.
- `scripts/check_juno_v1_ci_wiring.py` now fails if the dry-run rehearsal guard disappears or moves after Rust setup.

This protects the uni-7 handoff path: synthetic tx fixtures → extractor → tx set file → deployment command builder → rendered template guard.

## Verification

```text
$ python3 scripts/check_juno_v1_dry_run_txs.py && python3 scripts/check_juno_v1_ci_wiring.py && git diff --check -- .github/workflows/tests_and_checks.yml scripts/check_juno_v1_ci_wiring.py
OK: Juno v1 dry-run tx fixtures exercise generator -> extractor -> builder -> template guard
fixture_files=16 tx_sets=16 render_guard=true
store_txs=9 instantiate_txs=7 total=16
OK: GitHub Actions wiring enforces Astroport-Juno v1 guards
tests_guards=scope/schema/template/tx-extractor/deployment-command/operator-checklist pre_rust=true dry_run_txs=true schema_post_generation=true artifact_guard_after_size=true
```

`git diff --check` produced no output.

## Next bounded slice

Make the final operator path even harder to misuse: add a tiny guard that confirms `deployment/tx/uni-7/` stays gitignored and that generated dry-run tx JSON never gets committed.
