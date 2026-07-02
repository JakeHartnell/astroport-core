#!/usr/bin/env python3
"""Validate factory docs match the Astroport-Juno v1 launch gate.

The factory README and planning ADRs are operator-facing. If they drift back to
upstream defaults (stable/custom pairs or permissionless-from-genesis text), an
operator/frontend handoff can open pool creation before the official first pool
is seeded and smoke-checked.
"""
from __future__ import annotations

import pathlib
import sys
from typing import NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
FACTORY_README = ROOT / "contracts" / "factory" / "README.md"
OVERVIEW = ROOT / "planning" / "00-overview.md"
WHITELIST_ADR = ROOT / "planning" / "03-whitelist-decision.md"
TEMPLATE = ROOT / "deployment" / "juno-v1-testnet.template.json"


def fail(msg: str) -> NoReturn:
    print(f"FAIL: {msg}")
    sys.exit(1)


def read(path: pathlib.Path) -> str:
    try:
        return path.read_text()
    except FileNotFoundError:
        fail(f"missing file: {path.relative_to(ROOT)}")


def require(path: pathlib.Path, text: str, needle: str) -> None:
    if needle not in text:
        fail(f"{path.relative_to(ROOT)} missing required text: {needle}")


def reject(path: pathlib.Path, text: str, needle: str) -> None:
    if needle in text:
        fail(f"{path.relative_to(ROOT)} contains stale/conflicting text: {needle}")


def main() -> None:
    factory_readme = read(FACTORY_README)
    overview = read(OVERVIEW)
    whitelist_adr = read(WHITELIST_ADR)
    template = read(TEMPLATE)

    for needle in (
        "only the constant-product (`xyk`) pair type",
        "permissioned: true",
        "permissioned: false",
        "official first pool",
        "Juno v1 does not use custom pair types",
        '"is_generator_disabled": false',
        '"whitelist": null',
    ):
        require(FACTORY_README, factory_readme, needle)

    for needle in (
        "default pair types are constant product and stableswap",
        "Anyone can execute this function to create an Astroport pair",
        "Custom pool types may also need extra parameters",
    ):
        reject(FACTORY_README, factory_readme, needle)

    for path, text in ((OVERVIEW, overview), (WHITELIST_ADR, whitelist_adr)):
        require(path, text, "first-pool launch gate")
        require(path, text, "permissioned: true")
        require(path, text, "permissioned: false")
        reject(path, text, "permissionless from day one")
        reject(path, text, "No `PairConfig` sets `permissioned: true`")

    require(TEMPLATE, template, '"permissioned": true')
    require(TEMPLATE, template, '"permissioned": false')
    require(TEMPLATE, template, '"first_pool_launch_gate"')

    print("OK: factory docs match Astroport-Juno v1 first-pool launch gate")
    print(
        "factory_docs=xyk_only permissioned_first_pool=true public_open_after_smoke=true stale_permissionless_text=false"
    )


if __name__ == "__main__":
    main()
