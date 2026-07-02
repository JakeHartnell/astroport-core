#!/usr/bin/env python3
"""Build the post-smoke `update_pair_config` open-XYK tx handoff.

This helper reads a rendered Astroport-Juno v1 deployment config and emits the
exact factory execute message plus a copy/paste-safe `junod tx wasm execute`
command for opening public XYK pair creation after the first pool is registered,
seeded, and smoke-checked.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import shlex
import sys
from typing import Any, NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = pathlib.Path("deployment/juno-v1-testnet.json")


def fail(message: str) -> NoReturn:
    print(f"FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def load_json(path: pathlib.Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text())
    except FileNotFoundError:
        fail(f"missing rendered deployment config: {path}")
    except json.JSONDecodeError as err:
        fail(f"invalid JSON in {path}: {err}")
    if not isinstance(data, dict):
        fail(f"deployment config must be a JSON object: {path}")
    return data


def one_pair_config(config: dict[str, Any], section: str) -> dict[str, Any]:
    factory = config.get(section, {}).get("astroport-factory")
    if not isinstance(factory, dict):
        fail(f"missing {section}.astroport-factory")
    pair_configs = factory.get("pair_configs")
    if not isinstance(pair_configs, list) or len(pair_configs) != 1 or not isinstance(pair_configs[0], dict):
        fail(f"{section}.astroport-factory.pair_configs must contain exactly one XYK config")
    return pair_configs[0]


def validate_xyk_pair_config(pair_config: dict[str, Any], *, permissioned: bool, label: str) -> None:
    if pair_config.get("pair_type") != {"xyk": {}}:
        fail(f"{label} must be XYK-only")
    if pair_config.get("permissioned") is not permissioned:
        fail(f"{label} must have permissioned={str(permissioned).lower()}")
    if pair_config.get("is_disabled") is not False:
        fail(f"{label} must keep is_disabled=false")
    if pair_config.get("is_generator_disabled") is not False:
        fail(f"{label} must keep is_generator_disabled=false")
    if pair_config.get("whitelist") is not None:
        fail(f"{label} must not add a whitelist while opening XYK")
    for int_field in ("code_id", "total_fee_bps", "maker_fee_bps"):
        if not isinstance(pair_config.get(int_field), int):
            fail(f"{label}.{int_field} must be an integer")


def build_message(config: dict[str, Any]) -> dict[str, Any]:
    initial = config.get("instantiate_msgs", {}).get("astroport-factory", {}).get("pair_configs")
    if not isinstance(initial, list) or len(initial) != 1 or not isinstance(initial[0], dict):
        fail("instantiate_msgs.astroport-factory.pair_configs must contain exactly one XYK config")
    validate_xyk_pair_config(initial[0], permissioned=True, label="instantiate factory pair config")

    final = one_pair_config(config, "post_update_state")
    validate_xyk_pair_config(final, permissioned=False, label="post-update factory pair config")

    for same_field in ("code_id", "pair_type", "total_fee_bps", "maker_fee_bps", "is_disabled", "is_generator_disabled", "whitelist"):
        if initial[0].get(same_field) != final.get(same_field):
            fail(f"post-update pair config must preserve {same_field} from instantiate config")
    if final.get("code_id") != config.get("code_ids", {}).get("astroport-pair"):
        fail("post-update pair config code_id must match code_ids.astroport-pair")

    return {"update_pair_config": {"config": final}}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=pathlib.Path, default=DEFAULT_CONFIG, help="rendered deployment config to read")
    parser.add_argument("--from", dest="from_account", required=True, help="owner/governance key name or address authorized on the factory")
    parser.add_argument("--output", type=pathlib.Path, default=None, help="where the operator should save the broadcast tx JSON")
    parser.add_argument("--gas", default="auto")
    parser.add_argument("--gas-adjustment", default="1.3")
    parser.add_argument("--fees", default=None, help="optional explicit fee, for example 7500ujunox")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config_path = args.config
    config = load_json(config_path)
    chain_id = config.get("network", {}).get("chain_id")
    factory_addr = config.get("addresses", {}).get("astroport-factory")
    if not isinstance(chain_id, str) or not chain_id:
        fail("rendered config missing network.chain_id")
    if not isinstance(factory_addr, str) or not factory_addr.startswith("juno"):
        fail("rendered config missing addresses.astroport-factory")

    message = build_message(config)
    message_json = json.dumps(message, separators=(",", ":"), sort_keys=True)
    output = args.output or pathlib.Path(f"deployment/tx/{chain_id}/update-pair-config-open-xyk.json")

    command = [
        "junod",
        "tx",
        "wasm",
        "execute",
        factory_addr,
        message_json,
        "--from",
        args.from_account,
        "--chain-id",
        chain_id,
        "--gas",
        args.gas,
        "--gas-adjustment",
        args.gas_adjustment,
        "--output",
        "json",
    ]
    if args.fees:
        command.extend(["--fees", args.fees])

    print("# Execute only after the first pool is registered, seeded, and smoke-checked.")
    print(json.dumps(message, indent=2, sort_keys=True))
    print("\n# Broadcast and save the tx JSON:")
    print(" ".join(shlex.quote(part) for part in command) + " > " + shlex.quote(str(output)))
    print(
        "open_pair_config_tx=ready "
        f"chain_id={chain_id} factory={factory_addr} output={output} permissioned=false"
    )


if __name__ == "__main__":
    main()
