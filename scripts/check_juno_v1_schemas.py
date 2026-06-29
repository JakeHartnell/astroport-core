#!/usr/bin/env python3
"""Check that committed JSON schemas match the Astroport-Juno v1 contract set.

Stale schemas are launch risk: they make stripped contracts look shippable to
frontend/integration work. This guard intentionally checks only directory names,
so it can run without cargo, jq, or network access.
"""
from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCHEMAS = ROOT / "schemas"

EXPECTED_SCHEMA_DIRS = {
    "astroport-factory",
    "astroport-incentives",
    "astroport-native-coin-registry",
    "astroport-oracle",
    "astroport-pair",
    "astroport-router",
    "astroport-tokenfactory-tracker",
    "astroport-whitelist",
}

FORBIDDEN_SCHEMA_DIRS = {
    "astro-token-converter",
    "astroport-maker",
    "astroport-pair-concentrated",
    "astroport-pair-concentrated-duality",
    "astroport-pair-concentrated-sale-tax",
    "astroport-pair-converter",
    "astroport-pair-stable",
    "astroport-pair-xastro",
    "astroport-pair-xyk-sale-tax",
    "astroport-staking",
    "astroport-vesting",
    "astroport-xastro-token",
}


def fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    sys.exit(1)


def main() -> None:
    if not SCHEMAS.exists():
        fail("schemas/ directory is missing; run scripts/build_schemas.sh before release")

    actual = {p.name for p in SCHEMAS.iterdir() if p.is_dir()}
    missing = EXPECTED_SCHEMA_DIRS - actual
    extra = actual - EXPECTED_SCHEMA_DIRS
    forbidden = actual & FORBIDDEN_SCHEMA_DIRS

    if missing:
        fail(f"missing v1 schema dir(s): {sorted(missing)}")
    if forbidden:
        fail(f"forbidden stale schema dir(s): {sorted(forbidden)}")
    if extra:
        fail(f"unexpected schema dir(s): {sorted(extra)}")

    print("OK: committed schemas match Astroport-Juno v1 contract set")
    print(f"schema_dirs={len(actual)} expected={len(EXPECTED_SCHEMA_DIRS)}")


if __name__ == "__main__":
    main()
