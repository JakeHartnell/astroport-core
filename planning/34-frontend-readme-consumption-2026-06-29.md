# 34 — Frontend README consumption snippet

## Increment

Added a focused frontend-consumption section to `deployment/README.md` for the Astroport-Juno v1 handoff.

The snippet shows frontend builders how to:

- import the rendered `juno-v1-testnet.json`,
- bind it to `JunoV1FrontendDeploymentConfig`,
- read canonical contract addresses from `config.addresses`,
- use the first XYK pair-create template only as a launch form seed,
- keep existing pool discovery routed through factory queries instead of hardcoded pool addresses.

## Verification

```console
$ python3 scripts/check_juno_v1_frontend_example.py
OK: Juno v1 frontend TypeScript example consumes the generated handoff type
code_ids=9 addresses=7 required=4 optional=1 pair_type=xyk

$ python3 scripts/check_juno_v1_frontend_config.py
OK: Juno v1 frontend config handoff is internally consistent
required_addresses=4 optional_addresses=1 native=ujunox pair_type=xyk factory_ref=juno1replacefactory000000000000000000000000000000

$ git diff --check -- deployment/README.md planning/34-frontend-readme-consumption-2026-06-29.md
# no output
```

## Next bounded slice

When real uni-7 upload/instantiate transaction JSON exists, run the deployment command bundle and confirm the rendered `juno-v1-testnet.json` still satisfies the frontend config/example guards.
