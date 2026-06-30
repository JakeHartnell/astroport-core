# 32 — Frontend TypeScript handoff guard

Date: 2026-06-29

## Increment

Generated a narrow TypeScript declaration file for the Astroport-Juno v1 frontend deployment handoff from the canonical deployment template.

## Why

Frontend integration should not infer launch scope from ad hoc JSON or stale Astroport surfaces. The handoff type exposes the exact v1 keys a UI needs after uni-7 render:

- network metadata
- v1 code ID keys
- v1 deployed address keys
- required frontend addresses: factory, router, native coin registry, incentives
- optional frontend address: oracle
- XYK-only first-pair create template

It deliberately excludes prelaunch hardcoded pools/pairs, stable/PCL variants, DEX-token surfaces, and other post-v1 scope.

## Files

- `scripts/generate_juno_v1_frontend_types.py`
- `deployment/juno-v1-frontend-config.d.ts`
- `.github/workflows/tests_and_checks.yml`
- `scripts/check_juno_v1_ci_wiring.py`

## Verification

```sh
python3 scripts/generate_juno_v1_frontend_types.py --check
python3 scripts/check_juno_v1_frontend_config.py
python3 scripts/check_juno_v1_ci_wiring.py
python3 scripts/check_juno_v1_dry_run_txs.py
python3 scripts/check_juno_v1_deployment_template.py
git diff --check -- deployment/juno-v1-frontend-config.d.ts scripts/generate_juno_v1_frontend_types.py .github/workflows/tests_and_checks.yml scripts/check_juno_v1_ci_wiring.py planning/00-overview.md planning/32-frontend-types-handoff-2026-06-29.md
```

Expected results from this run:

- TypeScript generator check passes and reports the generated declaration path.
- Frontend config guard passes with required/optional addresses and XYK factory discovery intact.
- CI wiring guard passes and enforces the type check before Rust work.
- Dry-run tx rehearsal still renders a config accepted by deployment and frontend guards.

## Next bounded slice

Add a tiny frontend example fixture that imports/copies `JunoV1FrontendDeploymentConfig` and validates a rendered config shape locally, or run the deployment bundle against real uni-7 tx JSON once available.
