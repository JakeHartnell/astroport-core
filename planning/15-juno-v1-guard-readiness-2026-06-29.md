# 15 — Juno v1 guard readiness check

Date: 2026-06-29

## Slice

Re-ran the local Astroport-Juno v1 guardrail checks and captured release-readiness state for the simple DEX surface.

## Why it matters

Juno DeFi v1 should stay boring and shippable: swaps, pools, liquidity, routing, and bounded LP incentives. The guard scripts keep `Cargo.toml`, planning docs, and committed JSON schemas from quietly drifting back into stable/PCL/converter/staking/vesting scope.

## Verification run

```sh
python3 scripts/check_juno_v1_scope.py \
  && python3 scripts/check_juno_v1_schemas.py \
  && git diff --check -- scripts/check_juno_v1_scope.py scripts/check_juno_v1_schemas.py planning/01-strip-list.md planning/04-incentives-types-decision.md planning/13-scope-guard-verification-2026-06-28.md planning/14-schema-scope-guard-2026-06-28.md schemas
command -v cargo || true; command -v rustc || true; command -v just || true
```

Results:

```text
OK: Astroport-Juno v1 scope matches Cargo.toml and planning/01-strip-list.md
workspace_members=13 expected_wasms=8
OK: committed schemas match Astroport-Juno v1 contract set
schema_dirs=8 expected=8
```

`git diff --check` produced no output.

Tooling available on this host:

```text
/usr/bin/just
```

No `cargo` or `rustc` binary was found on `PATH`, so full Rust build/schema regeneration remains blocked on a Rust toolchain or build container.

## Current guarded v1 contract surface

- `astroport_factory.wasm`
- `astroport_pair.wasm`
- `astroport_router.wasm`
- `astroport_native_coin_registry.wasm`
- `astroport_oracle.wasm`
- `astroport_tokenfactory_tracker.wasm`
- `astroport_whitelist.wasm`
- `astroport_incentives.wasm`

## Next

Run the same guards inside the Rust-enabled build environment after regenerating schemas, then wire both Python guards into CI/pre-audit docs before any Juno DEX v1 release branch.
