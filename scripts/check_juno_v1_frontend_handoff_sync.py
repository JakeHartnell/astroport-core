#!/usr/bin/env python3
"""Keep the Juno v1 frontend handoff address surface synchronized.

The deployment template is the source of truth for which contract addresses the
frontend must consume at launch. This guard checks that the generated TypeScript
unions, consumer example, and deployment README all present the same required
and optional frontend address keys. It is intentionally dependency-free so it can
run before Rust/toolchain setup in CI.
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
README = ROOT / "deployment" / "README.md"


def fail(message: str) -> NoReturn:
    print(f"FAIL: {message}")
    sys.exit(1)


def read(path: pathlib.Path) -> str:
    try:
        return path.read_text()
    except FileNotFoundError:
        fail(f"missing {path.relative_to(ROOT)}")


def load_template() -> dict[str, Any]:
    try:
        data = json.loads(TEMPLATE.read_text())
    except FileNotFoundError:
        fail("missing deployment/juno-v1-testnet.template.json")
    except json.JSONDecodeError as exc:
        fail(f"invalid deployment template JSON: {exc}")
    if not isinstance(data, dict):
        fail("deployment template must be a JSON object")
    return data


def ts_union_values(text: str, type_name: str) -> list[str]:
    match = re.search(rf"export type {re.escape(type_name)} = (?P<body>.*?);", text, re.S)
    if not match:
        fail(f"generated types missing {type_name}")
    return re.findall(r'"([a-z0-9-]+)"', match.group("body"))


def example_array_values(text: str, name: str) -> list[str]:
    match = re.search(rf"{re.escape(name)}:\s*\[(?P<body>.*?)\]", text, re.S)
    if not match:
        fail(f"frontend example missing {name} array")
    return re.findall(r'"([a-z0-9-]+)"', match.group("body"))


def frontend_address_map_keys(text: str) -> list[str]:
    match = re.search(
        r"return\s*{(?P<body>.*?)^\s*};\s*\n}\s*\n\s*export function firstXykPairCreateMsg",
        text,
        re.S | re.M,
    )
    if not match:
        fail("frontend example missing frontendAddressMap return object")
    return re.findall(r'"([a-z0-9-]+)"\s*:', match.group("body"))


def backticked_list(values: list[str]) -> str:
    return ", ".join(f"`{value}`" for value in values)


def main() -> None:
    template = load_template()
    types = read(TYPES)
    example = read(EXAMPLE)
    readme = read(README)

    frontend = template.get("frontend")
    if not isinstance(frontend, dict):
        fail("deployment template missing frontend object")

    expected_required = frontend.get("required_addresses")
    expected_optional = frontend.get("optional_addresses")
    if not isinstance(expected_required, list) or not all(isinstance(v, str) for v in expected_required):
        fail("deployment template frontend.required_addresses must be a string array")
    if not isinstance(expected_optional, list) or not all(isinstance(v, str) for v in expected_optional):
        fail("deployment template frontend.optional_addresses must be a string array")

    expected_all = expected_required + expected_optional
    if len(expected_all) != len(set(expected_all)):
        fail("frontend required/optional address keys overlap")

    address_keys = set(template.get("addresses", {}))
    missing = [key for key in expected_all if key not in address_keys]
    if missing:
        fail(f"frontend address keys are not present in deployment addresses: {missing}")

    type_required = ts_union_values(types, "JunoV1RequiredFrontendAddressKey")
    type_optional = ts_union_values(types, "JunoV1OptionalFrontendAddressKey")
    if type_required != expected_required:
        fail(f"required frontend type union drifted: {type_required}")
    if type_optional != expected_optional:
        fail(f"optional frontend type union drifted: {type_optional}")

    example_required = example_array_values(example, "required_addresses")
    example_optional = example_array_values(example, "optional_addresses")
    example_map = frontend_address_map_keys(example)
    if example_required != expected_required:
        fail(f"example required_addresses drifted: {example_required}")
    if example_optional != expected_optional:
        fail(f"example optional_addresses drifted: {example_optional}")
    if example_map != expected_all:
        fail(f"frontendAddressMap keys must be required+optional order, got {example_map}")

    required_line = f"Required frontend addresses: {backticked_list(expected_required)}."
    optional_line = f"Optional frontend addresses: {backticked_list(expected_optional)}."
    if required_line not in readme:
        fail(f"README missing synchronized required-address line: {required_line}")
    if optional_line not in readme:
        fail(f"README missing synchronized optional-address line: {optional_line}")

    print("OK: Juno v1 frontend handoff address keys are synchronized")
    print(
        f"required={len(expected_required)} optional={len(expected_optional)} "
        f"map_keys={len(example_map)} source=deployment-template"
    )


if __name__ == "__main__":
    main()
