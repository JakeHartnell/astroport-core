# 22 — Deployment handoff README

Date: 2026-06-29

## Increment

Added `deployment/README.md` as the operator/frontend handoff for the uni-7 bakeoff.

The README lists the exact values that must be collected from real upload and instantiate output before rendering a concrete config:

- four governance/operator accounts;
- nine code IDs;
- seven instantiated contract addresses;
- one real first-pool counterpart denom.

It also includes a copy/paste `fill_juno_v1_deployment_config.py --require-complete` command and the follow-up template guard command so the rendered `deployment/juno-v1-testnet.json` can be checked before frontend use.

## Scope guardrails

The README keeps the v1 surface narrow:

- XYK-only and permissionless;
- no new DEX token;
- no stable pairs, LSTs, perps, or yield surfaces;
- frontend discovers pools through the factory instead of hardcoding prelaunch pools.

## Verification

```text
$ python3 scripts/fill_juno_v1_deployment_config.py --output /tmp/juno-v1-readme-check.json --require-complete ...
OK: wrote rendered Juno v1 deployment config to /tmp/juno-v1-readme-check.json
sets=21 require_complete=True

$ python3 scripts/check_juno_v1_deployment_template.py /tmp/juno-v1-readme-check.json
OK: Juno v1 deployment template matches instantiate schema requirements
instantiate_msgs=7 code_ids=9 addresses=7 pair_type=xyk

$ python3 scripts/check_juno_v1_deployment_template.py && python3 scripts/check_juno_v1_scope.py && python3 scripts/check_juno_v1_schemas.py && python3 scripts/check_juno_v1_ci_wiring.py
OK: Juno v1 deployment template matches instantiate schema requirements
instantiate_msgs=7 code_ids=9 addresses=7 pair_type=xyk
OK: Astroport-Juno v1 scope matches Cargo.toml and planning/01-strip-list.md
workspace_members=13 expected_wasms=8
OK: committed schemas match Astroport-Juno v1 contract set
schema_dirs=8 expected=8
OK: GitHub Actions wiring enforces Astroport-Juno v1 guards
tests_guards=scope/schema/template pre_rust=true schema_post_generation=true artifact_guard_after_size=true
```

## Next bounded slice

Add a small upload-output parser/checklist that can turn `junod tx wasm store` / `instantiate` JSON logs into the `--set` values for this README command.
