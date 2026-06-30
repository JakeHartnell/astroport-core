#!/usr/bin/env python3
"""Validate frontend-facing Astroport-Juno v1 deployment config invariants.

This guard is intentionally offline and dependency-free. It checks the handoff
surface a frontend consumes after a uni-7 render: canonical addresses are present,
instantiate messages are wired back to those addresses, and the first pool create
template stays a simple native JUNO XYK pair without hardcoded launch pools.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
from typing import Any, NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "deployment" / "juno-v1-testnet.template.json"

REQUIRED_FRONTEND_ADDRESSES = {
    "astroport-factory",
    "astroport-router",
    "astroport-native-coin-registry",
    "astroport-incentives",
}
OPTIONAL_FRONTEND_ADDRESSES = {"astroport-oracle"}


def fail(msg: str) -> NoReturn:
    print(f"FAIL: {msg}")
    sys.exit(1)


def load_json(path: pathlib.Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text())
    except FileNotFoundError:
        fail(f"missing config: {path}")
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {path}: {exc}")
    if not isinstance(data, dict):
        fail("top-level config must be a JSON object")
    return data


def require_dict(cfg: dict[str, Any], key: str) -> dict[str, Any]:
    value = cfg.get(key)
    if not isinstance(value, dict):
        fail(f"{key} must be an object")
    return value


def native_denom(asset_info: Any, path: str) -> str:
    if not isinstance(asset_info, dict):
        fail(f"{path} must be an object")
    native = asset_info.get("native_token")
    if not isinstance(native, dict) or not isinstance(native.get("denom"), str):
        fail(f"{path} must be a native_token denom")
    return native["denom"]


def assert_eq(path: str, actual: Any, expected: Any) -> None:
    if actual != expected:
        fail(f"{path} mismatch: expected {expected!r}, got {actual!r}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "config",
        nargs="?",
        type=pathlib.Path,
        default=DEFAULT_CONFIG,
        help="deployment config JSON to validate (default: deployment/juno-v1-testnet.template.json)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cfg = load_json(args.config)

    network = require_dict(cfg, "network")
    addresses = require_dict(cfg, "addresses")
    msgs = require_dict(cfg, "instantiate_msgs")
    frontend = require_dict(cfg, "frontend")
    pair_template = require_dict(cfg, "pair_create_msg_template")

    native = network.get("native_asset_denom")
    if not isinstance(native, str) or not native:
        fail("network.native_asset_denom must be a non-empty string")

    required = frontend.get("required_addresses")
    optional = frontend.get("optional_addresses", [])
    if not isinstance(required, list) or not all(isinstance(item, str) for item in required):
        fail("frontend.required_addresses must be a string list")
    if not isinstance(optional, list) or not all(isinstance(item, str) for item in optional):
        fail("frontend.optional_addresses must be a string list")

    required_set = set(required)
    optional_set = set(optional)
    if required_set != REQUIRED_FRONTEND_ADDRESSES:
        fail(f"frontend.required_addresses drifted: {sorted(required_set)}")
    if optional_set != OPTIONAL_FRONTEND_ADDRESSES:
        fail(f"frontend.optional_addresses drifted: {sorted(optional_set)}")

    missing = sorted((required_set | optional_set) - set(addresses))
    if missing:
        fail(f"frontend address keys missing from addresses: {missing}")

    if "pools" in frontend or "pairs" in frontend:
        fail("frontend config must not hardcode pools/pairs before launch; discover via factory")
    discovery = frontend.get("pair_discovery")
    if not isinstance(discovery, str) or "factory" not in discovery.lower() or "hardcode" not in discovery.lower():
        fail("frontend.pair_discovery must direct clients to factory discovery and avoid hardcoded pools")

    factory_addr = addresses["astroport-factory"]
    incentives_addr = addresses["astroport-incentives"]
    coin_registry_addr = addresses["astroport-native-coin-registry"]
    router_addr = addresses["astroport-router"]

    factory_msg = require_dict(msgs, "astroport-factory")
    router_msg = require_dict(msgs, "astroport-router")
    incentives_msg = require_dict(msgs, "astroport-incentives")
    oracle_msg = require_dict(msgs, "astroport-oracle")

    assert_eq("instantiate_msgs.astroport-factory.coin_registry_address", factory_msg.get("coin_registry_address"), coin_registry_addr)
    assert_eq("instantiate_msgs.astroport-factory.generator_address", factory_msg.get("generator_address"), None)
    assert_eq("instantiate_msgs.astroport-router.astroport_factory", router_msg.get("astroport_factory"), factory_addr)
    assert_eq("instantiate_msgs.astroport-incentives.factory", incentives_msg.get("factory"), factory_addr)
    if "reward_token" not in incentives_msg:
        fail("instantiate_msgs.astroport-incentives missing reward_token")
    legacy_incentives = sorted({"astro_token", "vesting_contract"} & set(incentives_msg))
    if legacy_incentives:
        fail("instantiate_msgs.astroport-incentives uses legacy key(s): " + ", ".join(legacy_incentives))
    post_update_state = require_dict(cfg, "post_update_state")
    factory_final = require_dict(post_update_state, "astroport-factory")
    assert_eq("post_update_state.astroport-factory.generator_address", factory_final.get("generator_address"), incentives_addr)
    assert_eq("instantiate_msgs.astroport-oracle.factory_contract", oracle_msg.get("factory_contract"), factory_addr)

    if router_addr == factory_addr:
        fail("frontend router and factory addresses must be distinct keys/values")

    pair_type = pair_template.get("pair_type")
    if not isinstance(pair_type, dict) or set(pair_type) != {"xyk"}:
        fail("pair_create_msg_template.pair_type must stay XYK-only")
    assets = pair_template.get("asset_infos")
    if not isinstance(assets, list) or len(assets) != 2:
        fail("pair_create_msg_template.asset_infos must contain exactly two assets")
    if native_denom(assets[0], "pair_create_msg_template.asset_infos[0]") != native:
        fail("first pair asset must be network.native_asset_denom")
    counterparty = native_denom(assets[1], "pair_create_msg_template.asset_infos[1]")
    if counterparty == native:
        fail("first pool counterparty denom must differ from native_asset_denom")
    if pair_template.get("init_params") is not None:
        fail("XYK pair_create_msg_template.init_params must remain null")

    print("OK: Juno v1 frontend config handoff is internally consistent")
    print(
        f"required_addresses={len(required_set)} optional_addresses={len(optional_set)} "
        f"native={native} pair_type=xyk factory_ref={factory_addr}"
    )


if __name__ == "__main__":
    main()
