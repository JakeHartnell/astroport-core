# 27 — Dry-run tx fixture rehearsal

Date: 2026-06-29

## Increment

Added a rehearsal path for the Astroport-Juno v1 uni-7 deployment handoff:

- `scripts/generate_juno_v1_dry_run_txs.py` writes the exact 16 tx JSON filenames expected by the operator checklist, using harmless synthetic `code_id` and `_contract_address` events.
- `scripts/check_juno_v1_dry_run_txs.py` proves the full local path works: generator → extractor → `tx-sets.txt` → deployment command builder with `--render` → template guard.
- `deployment/README.md` now points operators at the dry-run rehearsal before real chain tx output exists.

This keeps DeFi v1 boring and narrow: swaps/pools/liquidity deployment plumbing only, no scope creep.

## Verification

```text
$ python3 scripts/check_juno_v1_dry_run_txs.py && python3 scripts/check_juno_v1_operator_checklist.py && python3 scripts/check_juno_v1_deployment_command.py && python3 scripts/check_juno_v1_tx_extractor.py && python3 scripts/check_juno_v1_deployment_template.py && git diff --check -- scripts/generate_juno_v1_dry_run_txs.py scripts/check_juno_v1_dry_run_txs.py deployment/README.md
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
```

`git diff --check` produced no output.

## Next bounded slice

Wire `scripts/check_juno_v1_dry_run_txs.py` into the cheap pre-Rust CI guard sequence, then extend `scripts/check_juno_v1_ci_wiring.py` so it fails if the rehearsal guard disappears.
