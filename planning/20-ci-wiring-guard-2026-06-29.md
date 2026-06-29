# 20 — CI wiring guard

Date: 2026-06-29

## Increment

Added a dependency-free GitHub Actions wiring validator for the Juno v1 launch guards.

The new `scripts/check_juno_v1_ci_wiring.py` scans workflow text and fails if:

- the scope/schema/deployment-template guards stop running before Rust install/cache-heavy work;
- the schema guard stops running again after schema regeneration and before the schema diff check;
- the artifact-set guard stops running after optimizer output and artifact size checks but before `cosmwasm-check`.

This is deliberately boring infrastructure: if someone edits CI while rushing toward uni-7, the launch guards should not silently become documentation theater.

## Files

- `.github/workflows/tests_and_checks.yml`
- `scripts/check_juno_v1_ci_wiring.py`
- `planning/20-ci-wiring-guard-2026-06-29.md`

## Verification

```text
$ python3 scripts/check_juno_v1_ci_wiring.py && python3 scripts/check_juno_v1_scope.py && python3 scripts/check_juno_v1_schemas.py && python3 scripts/check_juno_v1_deployment_template.py
OK: GitHub Actions wiring enforces Astroport-Juno v1 guards
tests_guards=scope/schema/template pre_rust=true schema_post_generation=true artifact_guard_after_size=true
OK: Astroport-Juno v1 scope matches Cargo.toml and planning/01-strip-list.md
workspace_members=13 expected_wasms=8
OK: committed schemas match Astroport-Juno v1 contract set
schema_dirs=8 expected=8
OK: Juno v1 deployment template matches instantiate schema requirements
instantiate_msgs=7 code_ids=9 addresses=7 pair_type=xyk

$ git diff --check -- .github/workflows/tests_and_checks.yml scripts/check_juno_v1_ci_wiring.py planning/20-ci-wiring-guard-2026-06-29.md
# no output
```

## Next bounded slice

Add a minimal deployment fill script that takes real uni-7 code IDs/addresses and updates a copied config while preserving the template guard’s v1 constraints.
