# 30 — Frontend config handoff guard

Date: 2026-06-29T08:25:39Z

## Increment

Added an offline, dependency-free frontend sanity guard for the Astroport-Juno v1 uni-7 deployment handoff:

- `scripts/check_juno_v1_frontend_config.py` validates the config consumed by a DEX frontend.
- It confirms `frontend.required_addresses` and `frontend.optional_addresses` stay on the intended small v1 surface.
- It checks frontend address keys exist in top-level `addresses` and that factory/router/incentives/oracle instantiate messages point back to those canonical addresses.
- It rejects pre-launch hardcoded `frontend.pools` / `frontend.pairs` and requires factory-based pair discovery.
- It verifies the first pool template remains simple: XYK-only, exactly two native assets, first asset equals `network.native_asset_denom`, counterparty differs, and `init_params` is `null`.
- CI now runs this guard before the CI-wiring guard, still before Rust setup.

This gives the future frontend handoff a cheap red light if a rendered deployment config drifts from the simple v1 DEX scope: swaps, pools, liquidity; no hardcoded pools or expanded product surface.

## Verification

```text
$ python3 scripts/check_juno_v1_frontend_config.py && python3 scripts/check_juno_v1_ci_wiring.py && git diff --check -- scripts/check_juno_v1_frontend_config.py scripts/check_juno_v1_ci_wiring.py .github/workflows/tests_and_checks.yml planning/00-overview.md planning/30-frontend-config-guard-2026-06-29.md
OK: Juno v1 frontend config handoff is internally consistent
required_addresses=4 optional_addresses=1 native=ujunox pair_type=xyk factory_ref=juno1replacefactory000000000000000000000000000000
OK: GitHub Actions wiring enforces Astroport-Juno v1 guards
tests_guards=scope/schema/template/tx-extractor/deployment-command/operator-checklist pre_rust=true dry_run_txs=true deployment_gitignore=true frontend_config=true schema_post_generation=true artifact_guard_after_size=true
```

`git diff --check` produced no output.

## Next bounded slice

Run the dry-run renderer into an ignored temp config and validate that concrete rendered output with both `check_juno_v1_deployment_template.py` and `check_juno_v1_frontend_config.py`.
