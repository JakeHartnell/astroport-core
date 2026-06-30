# 19 — CI deployment template guard

Date: 2026-06-29

## Increment

Wired the Juno v1 deployment template validator into the normal GitHub Actions test/check path.

The first CI step now runs all no-dependency launch guards before Rust install/cache-heavy work:

1. `scripts/check_juno_v1_scope.py`
2. `scripts/check_juno_v1_schemas.py`
3. `scripts/check_juno_v1_deployment_template.py`

This keeps the v1 launch surface boring and exact: XYK pools only, no stable/PCL/perps/yield creep, and a deployment template that tracks the instantiate schemas.

## Files

- `.github/workflows/tests_and_checks.yml`
- `planning/19-ci-deployment-template-guard-2026-06-29.md`

## Verification

```text
$ python3 scripts/check_juno_v1_scope.py && python3 scripts/check_juno_v1_schemas.py && python3 scripts/check_juno_v1_deployment_template.py
OK: Astroport-Juno v1 scope matches Cargo.toml and planning/01-strip-list.md
workspace_members=13 expected_wasms=8
OK: committed schemas match Astroport-Juno v1 contract set
schema_dirs=8 expected=8
OK: Juno v1 deployment template matches instantiate schema requirements
instantiate_msgs=7 code_ids=9 addresses=7 pair_type=xyk

$ git diff --check -- .github/workflows/tests_and_checks.yml planning/19-ci-deployment-template-guard-2026-06-29.md
# no output
```

## Next bounded slice

Run the GitHub Actions path on a branch/PR, or locally run the Rust checks after schema generation to make sure the full workflow still passes end-to-end.
