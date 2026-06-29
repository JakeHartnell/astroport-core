#!/usr/bin/env python3
"""Validate the Astroport-Juno v1 frontend TypeScript consumer example.

This is an offline, dependency-free guard. It does not try to replace a real
TypeScript compiler; it catches the launch-risk mistakes that matter for this
handoff fixture: importing the generated v1 type, using `satisfies`, keeping the
frontend address surface exact, preserving an XYK-only pair template, and not
teaching frontends to hardcode launch pools/pairs.
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
from typing import Any, NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "deployment" / "juno-v1-testnet.template.json"
TYPES = ROOT / "deployment" / "juno-v1-frontend-config.d.ts"
EXAMPLE = ROOT / "deployment" / "juno-v1-frontend-config.example.ts"

FORBIDDEN_SCOPE = (
    "pair_stable",
    "pair_concentrated",
    "xastro",
    "astro-token",
    "maker",
    "vesting",
    "perp",
    "lst",
    "vault",
)


def fail(msg: str) -> NoReturn:
    print(f"FAIL: {msg}")
    sys.exit(1)


def load_json(path: pathlib.Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text())
    except FileNotFoundError:
        fail(f"missing {path.relative_to(ROOT)}")
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {path.relative_to(ROOT)}: {exc}")
    if not isinstance(data, dict):
        fail(f"{path.relative_to(ROOT)} must contain a JSON object")
    return data


def read(path: pathlib.Path) -> str:
    try:
        return path.read_text()
    except FileNotFoundError:
        fail(f"missing {path.relative_to(ROOT)}")


def quoted_keys_from_record(text: str, record_name: str) -> set[str]:
    match = re.search(rf"{record_name}:\s*{{(?P<body>.*?)^  }},", text, re.S | re.M)
    if not match:
        fail(f"example missing {record_name} object")
    return set(re.findall(r'"([a-z0-9-]+)"\s*:', match.group("body")))


def quoted_values_from_array(text: str, name: str) -> list[str]:
    match = re.search(rf"{name}:\s*\[(?P<body>.*?)\]", text, re.S)
    if not match:
        fail(f"example missing {name} array")
    return re.findall(r'"([a-z0-9-]+)"', match.group("body"))


def main() -> None:
    template = load_json(TEMPLATE)
    types = read(TYPES)
    example = read(EXAMPLE)

    required_snippets = (
        "import type {",
        "JunoV1FrontendDeploymentConfig",
        "JunoV1FrontendAddressKey",
        'from "./juno-v1-frontend-config"',
        "satisfies JunoV1FrontendDeploymentConfig",
        "frontendAddressMap(",
        "firstXykPairCreateMsg(",
        "pair_type: { xyk: {} }",
        "init_params: null",
    )
    for snippet in required_snippets:
        if snippet not in example:
            fail(f"example missing required snippet: {snippet}")

    lowered = example.lower()
    forbidden_hits = [term for term in FORBIDDEN_SCOPE if term in lowered]
    if forbidden_hits:
        fail(f"example includes deferred/non-v1 scope terms: {forbidden_hits}")

    if re.search(r"\b(pools|pairs):\s*\[", example):
        fail("example must not include hardcoded pools/pairs arrays")
    if "factory contract, not hardcoded" not in lowered:
        fail("example must explicitly direct pair discovery through factory, not hardcoded pools")

    expected_code_ids = set(template.get("code_ids", {}))
    expected_addresses = set(template.get("addresses", {}))
    expected_required = list(template["frontend"]["required_addresses"])
    expected_optional = list(template["frontend"]["optional_addresses"])

    code_keys = quoted_keys_from_record(example, "code_ids")
    address_keys = quoted_keys_from_record(example, "addresses")
    required = quoted_values_from_array(example, "required_addresses")
    optional = quoted_values_from_array(example, "optional_addresses")

    if code_keys != expected_code_ids:
        fail(f"example code_ids keys drifted: {sorted(code_keys)}")
    if address_keys != expected_addresses:
        fail(f"example addresses keys drifted: {sorted(address_keys)}")
    if required != expected_required:
        fail(f"example required_addresses drifted: {required}")
    if optional != expected_optional:
        fail(f"example optional_addresses drifted: {optional}")

    type_address_union = re.search(r"export type JunoV1AddressKey = (?P<body>.*?);", types)
    if not type_address_union:
        fail("generated type file missing JunoV1AddressKey union")
    type_address_keys = set(re.findall(r'"([a-z0-9-]+)"', type_address_union.group("body")))
    if address_keys != type_address_keys:
        fail("example address keys do not match generated type union")

    print("OK: Juno v1 frontend TypeScript example consumes the generated handoff type")
    print(
        f"code_ids={len(code_keys)} addresses={len(address_keys)} "
        f"required={len(required)} optional={len(optional)} pair_type=xyk"
    )


if __name__ == "__main__":
    main()
