# 31 — Dry-run rendered frontend validation

Date: 2026-06-29T08:31:45Z

## Increment

Extended the existing dry-run deployment rehearsal so it now validates the frontend handoff against a concrete rendered config, not only the placeholder template:

- `scripts/check_juno_v1_dry_run_txs.py` still generates 16 synthetic uni-7 tx JSON files, extracts the 16 tx-derived `--set` values, and renders a complete deployment config through `scripts/build_juno_v1_deployment_command.py --render`.
- It now also runs `scripts/check_juno_v1_frontend_config.py <rendered-config>` against that temp rendered output.
- This catches a real operator-handoff class of drift: tx-derived addresses/code IDs plus manual values can pass instantiate-schema checks but still break frontend address wiring or the simple first XYK pair template.

This is still offline and dependency-free. It does not assert real chain deployment success; it proves the rehearsal path can produce a config that both deployment and frontend guards accept.

## Verification

```text
$ python3 scripts/check_juno_v1_dry_run_txs.py && python3 scripts/check_juno_v1_frontend_config.py && python3 scripts/check_juno_v1_ci_wiring.py && git diff --check -- scripts/check_juno_v1_dry_run_txs.py
OK: Juno v1 dry-run tx fixtures exercise generator -> extractor -> builder -> template guard -> frontend guard
fixture_files=16 tx_sets=16 render_guard=true frontend_guard=true
store_txs=9 instantiate_txs=7 total=16
OK: Juno v1 frontend config handoff is internally consistent
required_addresses=4 optional_addresses=1 native=ujunox pair_type=xyk factory_ref=juno1replacefactory000000000000000000000000000000
OK: GitHub Actions wiring enforces Astroport-Juno v1 guards
tests_guards=scope/schema/template/tx-extractor/deployment-command/operator-checklist pre_rust=true dry_run_txs=true deployment_gitignore=true frontend_config=true schema_post_generation=true artifact_guard_after_size=true
```

`git diff --check` produced no output.

## Next bounded slice

Add a small frontend handoff JSON schema/TypeScript type generator from `deployment/juno-v1-testnet.template.json`, or run this rehearsal against real uni-7 tx JSON once the first upload/instantiate outputs exist.
