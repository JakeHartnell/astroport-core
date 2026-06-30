# 33 — Frontend example handoff guard

## Increment

Added a tiny TypeScript consumer fixture for the Astroport-Juno v1 frontend deployment handoff:

- `deployment/juno-v1-frontend-config.example.ts` imports the generated `JunoV1FrontendDeploymentConfig` type.
- The example uses `satisfies JunoV1FrontendDeploymentConfig` against the current uni-7 placeholder shape.
- It exposes a minimal frontend address map helper and a first XYK pair-create template helper.
- It explicitly keeps pair discovery at the factory and does not hardcode launch pools/pairs.

Added `scripts/check_juno_v1_frontend_example.py`, a dependency-free guard that verifies the example stays aligned with:

- `deployment/juno-v1-testnet.template.json` code ID keys
- deployment address keys
- frontend required/optional address arrays
- generated `JunoV1AddressKey` union
- v1 XYK-only/no-token/no-stable/no-PCL scope

Wired the new guard into `.github/workflows/tests_and_checks.yml` and extended the CI wiring guard so the example check must run before Rust setup and after frontend type generation.

## Verification

```console
$ python3 scripts/check_juno_v1_frontend_example.py
OK: Juno v1 frontend TypeScript example consumes the generated handoff type
code_ids=9 addresses=7 required=4 optional=1 pair_type=xyk

$ python3 scripts/check_juno_v1_ci_wiring.py
OK: GitHub Actions wiring enforces Astroport-Juno v1 guards
tests_guards=scope/schema/template/tx-extractor/deployment-command/operator-checklist pre_rust=true dry_run_txs=true deployment_gitignore=true frontend_config=true frontend_types=true frontend_example=true schema_post_generation=true artifact_guard_after_size=true
```

Also reran the frontend type/config guards plus scope/schema/deployment/dry-run guards in this slice.

## Next bounded slice

Run the dry-run deployment bundle and frontend example guard against the first real uni-7 tx JSON outputs when upload/instantiate transactions exist, or add a short frontend README snippet showing how a frontend repo should import the rendered JSON plus this declaration file.
