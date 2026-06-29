# 14 — Juno v1 schema scope guard

Date: 2026-06-28

## Slice

Pruned committed JSON schema directories so frontend/integration consumers only see the eight Astroport-Juno v1 contracts, then added a no-dependency schema-scope guard.

## Why it matters

The repository still contained generated schemas for stripped or deferred surfaces (`maker`, `staking`, `vesting`, `xastro_token`, stable/PCL/sale-tax/converter pairs). Those schemas make non-v1 contracts look available even when `Cargo.toml` and the strip plan exclude them. For a Juno-native v1 DEX, the schema surface should advertise only XYK swaps/pools, routing, registry/oracle/tracker/whitelist, and bounded LP incentives.

## Kept schema directories

```text
astroport-factory
astroport-incentives
astroport-native-coin-registry
astroport-oracle
astroport-pair
astroport-router
astroport-tokenfactory-tracker
astroport-whitelist
```

## Removed stale schema directories

```text
astro-token-converter
astroport-maker
astroport-pair-concentrated
astroport-pair-concentrated-duality
astroport-pair-concentrated-sale-tax
astroport-pair-converter
astroport-pair-stable
astroport-pair-xastro
astroport-pair-xyk-sale-tax
astroport-staking
astroport-vesting
astroport-xastro-token
```

## Verification

```sh
python3 scripts/check_juno_v1_schemas.py
python3 scripts/check_juno_v1_scope.py
git diff --check -- scripts/check_juno_v1_schemas.py schemas scripts/check_juno_v1_scope.py planning/01-strip-list.md planning/04-incentives-types-decision.md
```

Results:

```text
OK: committed schemas match Astroport-Juno v1 contract set
schema_dirs=8 expected=8
OK: Astroport-Juno v1 scope matches Cargo.toml and planning/01-strip-list.md
workspace_members=13 expected_wasms=8
```

`git diff --check` produced no output.

## Build caveat

This host currently has no `cargo` binary on `PATH`, so I could not regenerate schemas with `scripts/build_schemas.sh` in this run. The new guard is deliberately Python-only and verifies the committed schema surface that frontend work will consume.

## Next

Install/activate Rust on this host or run inside the known build container, then execute `scripts/build_schemas.sh` and re-run both Juno v1 guards.
