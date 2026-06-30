#!/usr/bin/env python3
"""Extract Astroport-Juno v1 deployment --set values from junod tx JSON.

Use this after `junod tx wasm store ... -o json` or `junod tx wasm instantiate ... -o json`
outputs are available. Map each tx JSON file to the deployment config key it
should populate, and the script prints copy/paste flags for
`scripts/fill_juno_v1_deployment_config.py`.

Examples:
  python3 scripts/extract_juno_v1_tx_sets.py \
    --code-id astroport-factory=store-factory.json \
    --address astroport-factory=instantiate-factory.json

  python3 scripts/extract_juno_v1_tx_sets.py --scan store-factory.json instantiate-factory.json
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
from collections.abc import Iterable
from typing import Any, NoReturn

CODE_ID_KEYS = {
    "astroport-factory",
    "astroport-incentives",
    "astroport-native-coin-registry",
    "astroport-oracle",
    "astroport-pair",
    "astroport-router",
    "astroport-tokenfactory-tracker",
    "astroport-whitelist",
    "cw20-base",
}

ADDRESS_KEYS = {
    "astroport-factory",
    "astroport-incentives",
    "astroport-native-coin-registry",
    "astroport-oracle",
    "astroport-router",
    "astroport-tokenfactory-tracker",
    "astroport-whitelist",
}

CODE_ATTRS = {"code_id", "codeID", "code-id"}
ADDRESS_ATTRS = {"_contract_address", "contract_address", "contract-address"}


def fail(message: str) -> NoReturn:
    print(f"FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def load_json(path: pathlib.Path) -> Any:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        fail(f"missing tx JSON: {path}")
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {path}: {exc}")


def iter_events(value: Any) -> Iterable[dict[str, Any]]:
    """Yield Cosmos SDK event objects from common tx response shapes."""
    if isinstance(value, dict):
        events = value.get("events")
        if isinstance(events, list):
            for event in events:
                if isinstance(event, dict):
                    yield event

        tx_response = value.get("tx_response")
        if isinstance(tx_response, dict):
            yield from iter_events(tx_response)

        logs = value.get("logs")
        if isinstance(logs, list):
            for log in logs:
                if isinstance(log, dict):
                    yield from iter_events(log)

        raw_log = value.get("raw_log")
        if isinstance(raw_log, str) and raw_log.startswith("["):
            try:
                yield from iter_events({"logs": json.loads(raw_log)})
            except json.JSONDecodeError:
                pass


def iter_attributes(event: dict[str, Any]) -> Iterable[tuple[str, str]]:
    attrs = event.get("attributes")
    if not isinstance(attrs, list):
        return
    for attr in attrs:
        if not isinstance(attr, dict):
            continue
        key = attr.get("key")
        value = attr.get("value")
        if isinstance(key, str) and isinstance(value, str):
            yield key, value


def extract_values(path: pathlib.Path, wanted_attrs: set[str]) -> list[str]:
    data = load_json(path)
    values: list[str] = []
    for event in iter_events(data):
        for key, value in iter_attributes(event):
            if key in wanted_attrs:
                values.append(value)
    return values


def parse_mapping(raw: str, allowed_keys: set[str], kind: str) -> tuple[str, pathlib.Path]:
    if "=" not in raw:
        fail(f"--{kind} must be NAME=PATH, got {raw!r}")
    key, path = raw.split("=", 1)
    if key not in allowed_keys:
        fail(f"unknown {kind} key {key!r}; expected one of: {', '.join(sorted(allowed_keys))}")
    if not path:
        fail(f"--{kind} path is empty for {key}")
    return key, pathlib.Path(path)


def unique_single(values: list[str], path: pathlib.Path, kind: str) -> str:
    unique = sorted(set(values))
    if not unique:
        fail(f"no {kind} found in {path}")
    if len(unique) > 1:
        fail(f"multiple {kind}s found in {path}: {', '.join(unique)}; split tx files or use --scan")
    return unique[0]


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--code-id", action="append", default=[], metavar="NAME=PATH", help="map first unique store code_id in PATH to code_ids.NAME")
    parser.add_argument("--address", action="append", default=[], metavar="NAME=PATH", help="map first unique instantiate contract address in PATH to addresses.NAME")
    parser.add_argument("--scan", nargs="*", type=pathlib.Path, default=[], help="print discovered code IDs and contract addresses without mapping")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    emitted = 0

    for raw in args.code_id:
        key, path = parse_mapping(raw, CODE_ID_KEYS, "code-id")
        value = unique_single(extract_values(path, CODE_ATTRS), path, "code_id")
        if not value.isdigit():
            fail(f"code_id for {key} in {path} is not numeric: {value!r}")
        print(f"--set code_ids.{key}={shell_quote(value)}")
        emitted += 1

    for raw in args.address:
        key, path = parse_mapping(raw, ADDRESS_KEYS, "address")
        value = unique_single(extract_values(path, ADDRESS_ATTRS), path, "contract address")
        print(f"--set addresses.{key}={shell_quote(value)}")
        emitted += 1

    for path in args.scan:
        code_ids = sorted(set(extract_values(path, CODE_ATTRS)))
        addresses = sorted(set(extract_values(path, ADDRESS_ATTRS)))
        print(f"# {path}")
        print(f"code_ids={','.join(code_ids) if code_ids else '-'}")
        print(f"addresses={','.join(addresses) if addresses else '-'}")
        emitted += 1

    if emitted == 0:
        fail("provide at least one --code-id, --address, or --scan input")


if __name__ == "__main__":
    main()
