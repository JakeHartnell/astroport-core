#!/usr/bin/env python3
"""Summarize the committed Astroport-Juno v1 schema surface for frontend work.

This is intentionally dependency-free. It reads the generated JSON schemas and
prints the top-level instantiate/execute/query/migrate/sudo message variants plus
response schema files per contract. The output is a quick integration map for UI
and deployment wiring without pretending deferred contracts exist.
"""
from __future__ import annotations

import json
import pathlib
import sys
from collections.abc import Iterable
from typing import NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCHEMAS = ROOT / "schemas"
MESSAGE_FILES = ("instantiate", "execute", "query", "migrate", "sudo")
EXPECTED_CONTRACTS = (
    "astroport-factory",
    "astroport-incentives",
    "astroport-native-coin-registry",
    "astroport-oracle",
    "astroport-pair",
    "astroport-router",
    "astroport-tokenfactory-tracker",
    "astroport-whitelist",
)


def fail(msg: str) -> NoReturn:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def load_json(path: pathlib.Path) -> dict:
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {path.relative_to(ROOT)}: {exc}")


def top_level_variants(schema: dict) -> list[str]:
    """Return snake_case top-level message variants from a cosmwasm schema."""
    variants: list[str] = []
    for branch in schema.get("oneOf", []):
        required = branch.get("required") or []
        if required:
            variants.append(str(required[0]))
    if variants:
        return variants
    # Instantiate schemas are often a single object rather than oneOf.
    props = schema.get("properties") or {}
    return sorted(str(k) for k in props)


def bullet_list(items: Iterable[str]) -> str:
    values = list(items)
    if not values:
        return "—"
    return ", ".join(f"`{item}`" for item in values)


def main() -> None:
    if not SCHEMAS.exists():
        fail("schemas/ directory is missing")

    actual_contracts = sorted(p.name for p in SCHEMAS.iterdir() if p.is_dir())
    missing = sorted(set(EXPECTED_CONTRACTS) - set(actual_contracts))
    extra = sorted(set(actual_contracts) - set(EXPECTED_CONTRACTS))
    if missing or extra:
        fail(f"schema contract set mismatch: missing={missing} extra={extra}")

    print("# Astroport-Juno v1 frontend schema surface")
    print()
    print("Generated from committed `schemas/*/raw/*.json`. Keep this surface boring: XYK swap/liquidity, pair discovery, registry/oracle reads, and external incentives only.")
    print()
    print("| Contract | Instantiate fields | Execute variants | Query variants | Other messages | Response schemas |")
    print("|---|---|---|---|---|---|")

    for contract in EXPECTED_CONTRACTS:
        raw = SCHEMAS / contract / "raw"
        if not raw.exists():
            fail(f"missing raw schema dir for {contract}")

        columns: dict[str, list[str]] = {}
        other: list[str] = []
        for message in MESSAGE_FILES:
            path = raw / f"{message}.json"
            if not path.exists():
                columns[message] = []
                continue
            variants = top_level_variants(load_json(path))
            if message in ("instantiate", "execute", "query"):
                columns[message] = variants
            else:
                other.extend(f"{message}:{variant}" for variant in variants)

        responses = sorted(p.stem.removeprefix("response_to_") for p in raw.glob("response_to_*.json"))
        print(
            f"| `{contract}` | {bullet_list(columns.get('instantiate', []))} | "
            f"{bullet_list(columns.get('execute', []))} | {bullet_list(columns.get('query', []))} | "
            f"{bullet_list(other)} | {bullet_list(responses)} |"
        )

    print()
    print(f"contracts={len(EXPECTED_CONTRACTS)}")


if __name__ == "__main__":
    main()
