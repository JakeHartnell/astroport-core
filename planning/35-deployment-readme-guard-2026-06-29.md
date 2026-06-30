# 35 — Deployment README handoff guard

## Increment

Added `scripts/check_juno_v1_deployment_readme.py`, a dependency-free guard for the uni-7 deployment handoff README.

The guard keeps `deployment/README.md` aligned with the launch helpers by checking:

- required operator/frontend sections,
- dry-run and extraction commands,
- the full render command shape with 4 account, 9 code ID, 7 address, and 1 first-pool denom `--set` values,
- generated frontend handoff files are present,
- the TypeScript `satisfies JunoV1FrontendDeploymentConfig` consumption snippet remains documented,
- v1 scope guardrails stay explicit: XYK-only, permissionless, no DEX token, no stable/LST/perps/yield scope, and factory-based pool discovery.

Wired the guard into `.github/workflows/tests_and_checks.yml` before Rust setup and extended `scripts/check_juno_v1_ci_wiring.py` so CI fails if the README guard disappears or runs out of order.

## Verification

```console
$ python3 scripts/check_juno_v1_deployment_readme.py
OK: Juno v1 deployment README matches operator/frontend handoff helpers
account_sets=4 code_id_sets=9 address_sets=7 frontend_snippet=true scope_guardrails=true

$ python3 scripts/check_juno_v1_ci_wiring.py
OK: GitHub Actions wiring enforces Astroport-Juno v1 guards
tests_guards=scope/schema/template/tx-extractor/deployment-command/operator-checklist pre_rust=true dry_run_txs=true deployment_gitignore=true deployment_readme=true frontend_config=true frontend_types=true frontend_example=true schema_post_generation=true artifact_guard_after_size=true

$ git diff --check -- .github/workflows/tests_and_checks.yml scripts/check_juno_v1_deployment_readme.py scripts/check_juno_v1_ci_wiring.py planning/35-deployment-readme-guard-2026-06-29.md
# no output
```

## Next bounded slice

Run the deployment bundle against real uni-7 tx JSON when available, or add a tiny CI/docs guard that verifies the frontend example and README stay synchronized on required frontend address keys.
