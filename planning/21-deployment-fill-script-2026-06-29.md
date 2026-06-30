# 21 — Deployment fill script

Date: 2026-06-29

## Increment

Added a small, dependency-free renderer for the uni-7 deployment/frontend config handoff:

- `scripts/fill_juno_v1_deployment_config.py`

It starts from `deployment/juno-v1-testnet.template.json`, accepts repeated `--set dotted.path=value` overrides for real code IDs, addresses, accounts, and network values, then rewires dependent instantiate fields from those top-level values.

This keeps the v1 deployment surface boring:

- XYK-only pair config remains in the template/guard.
- No DEX token is introduced; incentives still use the configured native denom.
- Frontend-required contract addresses stay in one top-level `addresses` section.
- `--require-complete` fails if placeholder strings remain or any code ID is still `0`.

## Guard update

`check_juno_v1_deployment_template.py` now accepts an optional config path, so both the placeholder template and a rendered concrete config can be checked with the same schema-derived guard.

## Verification

Ran a temp render with dummy uni-7 values and `--require-complete`, then validated the rendered config:

```sh
python3 scripts/fill_juno_v1_deployment_config.py --output /tmp/juno-v1-filled.json --require-complete ...
# OK: wrote rendered Juno v1 deployment config to /tmp/juno-v1-filled.json
# sets=21 require_complete=True

python3 scripts/check_juno_v1_deployment_template.py /tmp/juno-v1-filled.json
# OK: Juno v1 deployment template matches instantiate schema requirements
# instantiate_msgs=7 code_ids=9 addresses=7 pair_type=xyk
```

Also re-ran the default template guard to ensure existing CI behavior is unchanged.

## Next bounded slice

Add a sample `deployment/README.md` command block showing the exact fill command shape for uni-7 once upload/instantiate outputs are known.
