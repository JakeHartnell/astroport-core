# 16 — CI guard for Juno v1 artifacts

Date: 2026-06-29

## Slice

Added an optimized-artifact guard and wired the Juno v1 scope/schema/artifact checks into GitHub Actions.

## Why it matters

The v1 launch surface should remain a simple Juno-native DEX: factory, XYK pair, router, whitelist, native coin registry, oracle, tokenfactory tracker, and bounded LP incentives. CI now has cheap fail-fast checks before Rust work starts, after schema regeneration, and after rust-optimizer emits wasm artifacts.

This reduces the launch-risk class where deferred contracts such as stable/PCL pairs, maker, staking, vesting, xASTRO, converters, or sale-tax variants silently re-enter release artifacts.

## Files touched

- `scripts/check_juno_v1_artifacts.py`
- `.github/workflows/tests_and_checks.yml`
- `.github/workflows/check_artifacts.yml`

## CI wiring

- `tests_and_checks.yml` now runs:
  - `python3 scripts/check_juno_v1_scope.py`
  - `python3 scripts/check_juno_v1_schemas.py`
  - and re-runs the schema guard after `scripts/build_schemas.sh`.
- `check_artifacts.yml` now runs:
  - `scripts/check_artifacts_size.sh`
  - `python3 scripts/check_juno_v1_artifacts.py` after optimizer output exists.

## Expected v1 artifact set

- `astroport_factory.wasm`
- `astroport_pair.wasm`
- `astroport_router.wasm`
- `astroport_native_coin_registry.wasm`
- `astroport_oracle.wasm`
- `astroport_tokenfactory_tracker.wasm`
- `astroport_whitelist.wasm`
- `astroport_incentives.wasm`

## Verification

Local host still has no Rust toolchain, and `scripts/build_release.sh` is blocked because the Docker daemon is not reachable here (`Cannot connect to the Docker daemon at unix:///var/run/docker.sock`). The new artifact guard was verified with a temporary fake artifact directory containing exactly the eight expected wasm names, plus a negative extra-artifact check.

## Next

Run the CI path or local `scripts/build_release.sh` in a Rust/Docker-enabled environment and confirm `scripts/check_juno_v1_artifacts.py` passes against real optimized wasm output.
