#!/usr/bin/env python3
"""Check the Astroport-Juno v1 contract scope against the planning manifest.

This is intentionally lightweight: no network, no cargo invocation, no third-party
packages. It catches the launch-risk class where docs say one contract set while
Cargo.toml builds another.
"""
from __future__ import annotations

import pathlib
import sys
import tomllib

ROOT = pathlib.Path(__file__).resolve().parents[1]

EXPECTED_WORKSPACE_MEMBERS = {
    "packages/astroport",
    "packages/astroport_juno_types",
    "packages/astroport_test",
    "packages/circular_buffer",
    "contracts/factory",
    "contracts/pair",
    "contracts/router",
    "contracts/whitelist",
    "contracts/periphery/native_coin_registry",
    "contracts/periphery/oracle",
    "contracts/periphery/tokenfactory_tracker",
    "contracts/tokenomics/incentives",
    "integration-tests",
}

EXPECTED_EXCLUDES = {
    "contracts/pair_stable",
    "contracts/pair_concentrated",
    "packages/astroport_pcl_common",
}

EXPECTED_WASMS = {
    "astroport_factory.wasm",
    "astroport_pair.wasm",
    "astroport_router.wasm",
    "astroport_native_coin_registry.wasm",
    "astroport_oracle.wasm",
    "astroport_tokenfactory_tracker.wasm",
    "astroport_whitelist.wasm",
    "astroport_incentives.wasm",
}

FORBIDDEN_WORKSPACE_FRAGMENTS = (
    "pair_xastro",
    "pair_astro_converter",
    "pair_transmuter",
    "sale_tax",
    "maker",
    "staking",
    "vesting",
    "xastro_token",
)


def fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    sys.exit(1)


def main() -> None:
    cargo_toml = ROOT / "Cargo.toml"
    data = tomllib.loads(cargo_toml.read_text())
    workspace = data.get("workspace", {})
    members = set(workspace.get("members", []))
    excludes = set(workspace.get("exclude", []))

    missing = EXPECTED_WORKSPACE_MEMBERS - members
    extra = members - EXPECTED_WORKSPACE_MEMBERS
    if missing or extra:
        fail(f"workspace members drifted; missing={sorted(missing)} extra={sorted(extra)}")

    missing_excludes = EXPECTED_EXCLUDES - excludes
    if missing_excludes:
        fail(f"workspace excludes missing deferred contracts: {sorted(missing_excludes)}")

    forbidden = [m for m in members if any(fragment in m for fragment in FORBIDDEN_WORKSPACE_FRAGMENTS)]
    if forbidden:
        fail(f"forbidden v1 scope member(s): {forbidden}")

    strip_list = (ROOT / "planning" / "01-strip-list.md").read_text()
    missing_wasm_mentions = sorted(w for w in EXPECTED_WASMS if w not in strip_list)
    if missing_wasm_mentions:
        fail(f"planning/01-strip-list.md missing wasm artifact(s): {missing_wasm_mentions}")

    print("OK: Astroport-Juno v1 scope matches Cargo.toml and planning/01-strip-list.md")
    print(f"workspace_members={len(members)} expected_wasms={len(EXPECTED_WASMS)}")


if __name__ == "__main__":
    main()
