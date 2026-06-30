#!/usr/bin/env python3
"""Validate the Astroport-Juno v1 deployment config template.

This deliberately avoids jsonschema dependencies. It checks the parts that reduce
launch risk here: every v1 instantiate message exists, all schema-required fields
are present, code IDs/addresses are wired for the exact v1 contract set, and the
factory/pair templates stay XYK-only with a permissioned first-pool launch gate.
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
LEGACY_INCENTIVES_KEYS = {"astro_token", "vesting_contract"}


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
        if contract == "astroport-incentives":
            legacy = sorted(LEGACY_INCENTIVES_KEYS & set(msg))
            if legacy:
                fail("instantiate_msgs.astroport-incentives uses legacy key(s): " + ", ".join(legacy))
        missing = sorted(required_fields(contract) - set(msg))
        if missing:
            fail(f"instantiate_msgs.{contract} missing required field(s): {missing}")

    incentives_msg = cfg["instantiate_msgs"]["astroport-incentives"]
    incentives_required = required_fields("astroport-incentives")
    if "reward_token" not in incentives_required or incentives_required & LEGACY_INCENTIVES_KEYS:
        fail(
            "schemas/astroport-incentives/raw/instantiate.json is stale; "
            "expected reward_token and no astro_token/vesting_contract"
        )

    factory_msg = cfg["instantiate_msgs"]["astroport-factory"]
    if factory_msg.get("generator_address") is not None:
        fail("factory instantiate generator_address must be null; set it via post-update update_config")
    post_update_state = cfg.get("post_update_state")
    if not isinstance(post_update_state, dict):
        fail("missing post_update_state section")
    factory_final = post_update_state.get("astroport-factory")
    if not isinstance(factory_final, dict):
        fail("post_update_state.astroport-factory must be an object")
    expected_generator = cfg["addresses"]["astroport-incentives"]
    if factory_final.get("generator_address") != expected_generator:
        fail("post_update_state.astroport-factory.generator_address must equal addresses.astroport-incentives")
    pair_configs = factory_msg.get("pair_configs")
    if not isinstance(pair_configs, list) or len(pair_configs) != 1:
        fail("factory pair_configs must contain exactly one v1 XYK config")
    pair_config = pair_configs[0]
    keys = pair_type_keys(pair_config.get("pair_type"))
    if keys != {"xyk"}:
        fail(f"factory pair_type must be XYK-only, got {sorted(keys)}")
    if pair_config.get("permissioned") is not True:
        fail("factory instantiate XYK pair config must stay permissioned until the official first pool is seeded")
    if pair_config.get("is_disabled") is True:
        fail("factory XYK pair config must not be disabled")
    if keys & FORBIDDEN_PAIR_TYPES:
        fail(f"factory contains forbidden pair type(s): {sorted(keys & FORBIDDEN_PAIR_TYPES)}")

    final_pair_configs = factory_final.get("pair_configs")
    if not isinstance(final_pair_configs, list) or len(final_pair_configs) != 1:
        fail("post_update_state.astroport-factory.pair_configs must contain exactly one v1 XYK config")
    final_pair_config = final_pair_configs[0]
    final_keys = pair_type_keys(final_pair_config.get("pair_type"))
    if final_keys != {"xyk"}:
        fail(f"post-update factory pair_type must be XYK-only, got {sorted(final_keys)}")
    if final_pair_config.get("permissioned") is not False:
        fail("post-update factory XYK pair config must open permissionless creation only after the first-pool gate")
    if final_pair_config.get("code_id") != pair_config.get("code_id"):
        fail("post-update factory XYK pair code_id must match instantiate pair config")
    launch_gate = factory_final.get("first_pool_launch_gate")
    if not isinstance(launch_gate, str) or "seed" not in launch_gate or "permissioned=false" not in launch_gate:
        fail("post_update_state.astroport-factory.first_pool_launch_gate must document the seed-liquidity gate before permissioned=false")

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
    print(
        f"instantiate_msgs={len(EXPECTED_CONTRACTS)} code_ids={len(EXPECTED_CODE_IDS)} "
        f"addresses={len(EXPECTED_ADDRESSES)} pair_type=xyk first_pool_gate=permissioned"
    )


if __name__ == "__main__":
    main()
