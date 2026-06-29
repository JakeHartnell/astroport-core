#!/usr/bin/env python3
"""Check optimized wasm artifacts against the Astroport-Juno v1 contract set.

This guard is intentionally dependency-free so CI can run it immediately after
rust-optimizer. It catches the release-risk class where the workspace or build
container emits a deferred contract wasm even though docs/schemas describe the
smaller Juno v1 surface.
"""
from __future__ import annotations

import argparse
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

EXPECTED_ARTIFACTS = {
    "astroport_factory.wasm",
    "astroport_incentives.wasm",
    "astroport_native_coin_registry.wasm",
    "astroport_oracle.wasm",
    "astroport_pair.wasm",
    "astroport_router.wasm",
    "astroport_tokenfactory_tracker.wasm",
    "astroport_whitelist.wasm",
}

FORBIDDEN_ARTIFACT_FRAGMENTS = (
    "converter",
    "maker",
    "pair_concentrated",
    "pair_stable",
    "pair_xastro",
    "sale_tax",
    "staking",
    "vesting",
    "xastro_token",
)


def fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    sys.exit(1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "artifacts_dir",
        nargs="?",
        default=str(ROOT / "artifacts"),
        help="Directory containing optimized .wasm artifacts (default: ./artifacts)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    artifacts_dir = pathlib.Path(args.artifacts_dir)
    if not artifacts_dir.exists():
        fail(f"artifacts directory is missing: {artifacts_dir}")
    if not artifacts_dir.is_dir():
        fail(f"artifacts path is not a directory: {artifacts_dir}")

    actual = {p.name for p in artifacts_dir.glob("*.wasm") if p.is_file()}
    missing = EXPECTED_ARTIFACTS - actual
    extra = actual - EXPECTED_ARTIFACTS
    forbidden = sorted(
        name
        for name in actual
        if any(fragment in name for fragment in FORBIDDEN_ARTIFACT_FRAGMENTS)
    )

    if missing:
        fail(f"missing v1 artifact(s): {sorted(missing)}")
    if forbidden:
        fail(f"forbidden deferred artifact(s): {forbidden}")
    if extra:
        fail(f"unexpected artifact(s): {sorted(extra)}")

    print("OK: optimized artifacts match Astroport-Juno v1 contract set")
    print(f"artifact_count={len(actual)} expected={len(EXPECTED_ARTIFACTS)}")


if __name__ == "__main__":
    main()
