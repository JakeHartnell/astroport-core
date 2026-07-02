# Factory docs launch-gate guard — 2026-07-02

## Slice

The deployment template now uses a narrow first-pool launch gate: factory `xyk`
pair creation starts `permissioned: true`, operators create/seed the official
first pool, then owner/governance opens public pair creation by setting the same
`xyk` config to `permissioned: false` after smoke checks.

Some older docs still described upstream/default behavior: permissionless pair
creation from genesis, stable/custom pair surfaces, and whitelist as unused
forward-compat only. That is dangerous operator-facing drift.

## Change

- Updated `contracts/factory/README.md` to describe Juno v1 as XYK-only, document
  the permissioned first-pool gate, and include the current pair-config fields.
- Updated `planning/00-overview.md` and `planning/03-whitelist-decision.md` so
  ADR/status text matches the launch template.
- Added `scripts/check_juno_v1_factory_docs.py` and wired it into CI before Rust
  setup so stale permissionless/stable/custom-pair wording fails fast.

## Verification

Run:

```bash
python3 scripts/check_juno_v1_factory_docs.py
python3 scripts/check_juno_v1_ci_wiring.py
python3 scripts/check_juno_v1_deployment_template.py
python3 scripts/check_juno_v1_scope.py
python3 scripts/check_juno_v1_schemas.py
git diff --check -- contracts/factory/README.md planning/00-overview.md planning/03-whitelist-decision.md planning/39-factory-docs-launch-gate-2026-07-02.md scripts/check_juno_v1_factory_docs.py .github/workflows/tests_and_checks.yml scripts/check_juno_v1_ci_wiring.py
```

Expected result: all commands pass with no diff whitespace errors.
