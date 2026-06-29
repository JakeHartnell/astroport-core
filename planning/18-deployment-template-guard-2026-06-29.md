# 18 — Juno v1 deployment template guard

Date: 2026-06-29

## Increment

Added a minimal testnet deployment config template and a no-dependency validator for the Astroport-Juno v1 launch surface.

The template is intentionally boring: code IDs, contract addresses, instantiate messages, and frontend-required addresses for factory, router, native coin registry, incentives, oracle, tokenfactory tracker, and whitelist. It does not add a DEX token, stable pools, PCL, LSTs, perps, yield vaults, or other deferred surfaces.

## Files

- `deployment/juno-v1-testnet.template.json`
- `scripts/check_juno_v1_deployment_template.py`

## Guard behavior

`check_juno_v1_deployment_template.py` reads committed `schemas/*/raw/instantiate.json` and verifies:

- the template has instantiate messages for each directly instantiated v1 contract;
- each instantiate message includes all schema-required fields;
- code IDs include exactly the v1 contracts plus `cw20-base` for LP tokens;
- addresses include exactly the directly instantiated v1 contracts;
- factory `pair_configs` contains exactly one permissionless XYK config;
- the pair creation template is XYK-only;
- frontend-required addresses resolve to template addresses.

## Verification

```text
$ python3 scripts/check_juno_v1_deployment_template.py
OK: Juno v1 deployment template matches instantiate schema requirements
instantiate_msgs=7 code_ids=9 addresses=7 pair_type=xyk

$ python3 scripts/check_juno_v1_scope.py && python3 scripts/check_juno_v1_schemas.py
OK: Astroport-Juno v1 scope matches Cargo.toml and planning/01-strip-list.md
workspace_members=13 expected_wasms=8
OK: committed schemas match Astroport-Juno v1 contract set
schema_dirs=8 expected=8

$ git diff --check -- deployment/juno-v1-testnet.template.json scripts/check_juno_v1_deployment_template.py planning/18-deployment-template-guard-2026-06-29.md planning/00-overview.md
# no output
```

## Next bounded slice

Wire the deployment template guard into CI, then replace placeholders with real uni-7 code IDs/addresses after a successful optimized artifact build and upload.
