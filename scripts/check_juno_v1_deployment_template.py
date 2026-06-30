#!/usr/bin/env python3
"""Validate the Astroport-Juno v1 deployment config template.

This deliberately avoids jsonschema dependencies. It checks the parts that reduce
launch risk here: every v1 instantiate message exists, all schema-required fields
are present, code IDs/addresses are wired for the exact v1 contract set, and the
factory/pair templates stay XYK-only and permissionless.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
from typing import NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "deployment" / "juno-v1-testnet.template.json"
SCHEMAS = ROOT / "schemas"

EXPECTED_CONTRACTS = (
    "astroport-factory",
    "astroport-incentives",
    "astroport-native-coin-registry",
    "astroport-oracle",
    "astroport-router",
    "astroport-tokenfactory-tracker",
    "astroport-whitelist",
)
EXPECTED_CODE_IDS = EXPECTED_CONTRACTS + ("astroport-pair", "cw20-base")
EXPECTED_ADDRESSES = EXPECTED_CONTRACTS
FORBIDDEN_PAIR_TYPES = {"stable", "custom", "concentrated"}


def fail(msg: str) -> NoReturn:
    print(f"FAIL: {msg}")
    sys.exit(1)


def load_json(path: pathlib.Path) -> dict:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        fail(f"missing {path.relative_to(ROOT)}")
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {path.relative_to(ROOT)}: {exc}")


def required_fields(contract: str) -> set[str]:
    schema = load_json(SCHEMAS / contract / "raw" / "instantiate.json")
    return set(schema.get("required", []))


def assert_exact_keys(name: str, actual: dict, expected: tuple[str, ...]) -> None:
    actual_keys = set(actual)
    expected_keys = set(expected)
    missing = sorted(expected_keys - actual_keys)
    extra = sorted(actual_keys - expected_keys)
    if missing or extra:
        fail(f"{name} key mismatch: missing={missing} extra={extra}")


def pair_type_keys(pair_type: object) -> set[str]:
    if not isinstance(pair_type, dict):
        fail(f"pair_type must be an object, got {type(pair_type).__name__}")
    return set(pair_type)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "config",
        nargs="?",
        type=pathlib.Path,
        default=TEMPLATE,
        help="deployment config JSON to validate (default: deployment/juno-v1-testnet.template.json)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cfg = load_json(args.config)

    for top in ("network", "accounts", "code_ids", "addresses", "instantiate_msgs", "pair_create_msg_template", "frontend"):
        if top not in cfg:
            fail(f"missing top-level section: {top}")

    assert_exact_keys("code_ids", cfg["code_ids"], EXPECTED_CODE_IDS)
    assert_exact_keys("addresses", cfg["addresses"], EXPECTED_ADDRESSES)
    assert_exact_keys("instantiate_msgs", cfg["instantiate_msgs"], EXPECTED_CONTRACTS)

    for contract in EXPECTED_CONTRACTS:
        msg = cfg["instantiate_msgs"].get(contract)
        if not isinstance(msg, dict):
            fail(f"instantiate_msgs.{contract} must be an object")
        missing = sorted(required_fields(contract) - set(msg))
        if missing:
            fail(f"instantiate_msgs.{contract} missing required field(s): {missing}")

    factory_msg = cfg["instantiate_msgs"]["astroport-factory"]
    pair_configs = factory_msg.get("pair_configs")
    if not isinstance(pair_configs, list) or len(pair_configs) != 1:
        fail("factory pair_configs must contain exactly one v1 XYK config")
    pair_config = pair_configs[0]
    keys = pair_type_keys(pair_config.get("pair_type"))
    if keys != {"xyk"}:
        fail(f"factory pair_type must be XYK-only, got {sorted(keys)}")
    if pair_config.get("permissioned") is not False:
        fail("factory XYK pair config must remain permissionless")
    if pair_config.get("is_disabled") is True:
        fail("factory XYK pair config must not be disabled")
    if keys & FORBIDDEN_PAIR_TYPES:
        fail(f"factory contains forbidden pair type(s): {sorted(keys & FORBIDDEN_PAIR_TYPES)}")

    create_template = cfg["pair_create_msg_template"]
    create_keys = pair_type_keys(create_template.get("pair_type"))
    if create_keys != {"xyk"}:
        fail(f"pair_create_msg_template pair_type must be XYK-only, got {sorted(create_keys)}")
    if "asset_infos" not in create_template:
        fail("pair_create_msg_template missing asset_infos")
    if "init_params" not in create_template:
        fail("pair_create_msg_template missing init_params")

    required_frontend = set(cfg["frontend"].get("required_addresses", []))
    missing_frontend = required_frontend - set(cfg["addresses"])
    if missing_frontend:
        fail(f"frontend.required_addresses missing from addresses: {sorted(missing_frontend)}")

    print("OK: Juno v1 deployment template matches instantiate schema requirements")
    print(f"instantiate_msgs={len(EXPECTED_CONTRACTS)} code_ids={len(EXPECTED_CODE_IDS)} addresses={len(EXPECTED_ADDRESSES)} pair_type=xyk")


if __name__ == "__main__":
    main()
