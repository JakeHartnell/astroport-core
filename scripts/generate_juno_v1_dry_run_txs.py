#!/usr/bin/env python3
"""Generate fake uni-7 tx JSON files for the Astroport-Juno v1 handoff.

This is for operator rehearsal only. It creates the same 16 filenames named by
`deployment/operator-tx-checklist.md`, with harmless synthetic `code_id` and
`_contract_address` events that `scripts/extract_juno_v1_tx_sets.py` can parse.
It never touches real chain state and should not be used as deployment evidence.
"""
from __future__ import annotations

import argparse
import json
import pathlib
from typing import Any

STORE_KEYS = (
    "astroport-factory",
    "astroport-incentives",
    "astroport-native-coin-registry",
    "astroport-oracle",
    "astroport-pair",
    "astroport-router",
    "astroport-tokenfactory-tracker",
    "astroport-whitelist",
    "cw20-base",
)

ADDRESS_KEYS = (
    "astroport-factory",
    "astroport-incentives",
    "astroport-native-coin-registry",
    "astroport-oracle",
    "astroport-router",
    "astroport-tokenfactory-tracker",
    "astroport-whitelist",
)


def event_tx(event_type: str, attrs: dict[str, str], memo: str) -> dict[str, Any]:
    """Return a minimal Cosmos SDK tx-response-shaped JSON object."""
    return {
        "height": "0",
        "txhash": f"DRYRUN_{memo.upper().replace('-', '_')}",
        "code": 0,
        "raw_log": "[]",
        "tx_response": {
            "code": 0,
            "events": [
                {
                    "type": event_type,
                    "attributes": [{"key": key, "value": value} for key, value in attrs.items()],
                }
            ],
        },
    }


def synthetic_address(index: int, key: str) -> str:
    # Deliberately not a real address; enough shape for config plumbing tests.
    stem = key.replace("astroport-", "").replace("-", "")[:18]
    return f"juno1dryrun{index:02d}{stem}000000000000000000"


def write_json(path: pathlib.Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=False) + "\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=pathlib.Path,
        default=pathlib.Path("deployment/tx/uni-7-dry-run"),
        help="directory to write synthetic tx JSON files into",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir: pathlib.Path = args.output_dir

    written: list[pathlib.Path] = []
    for offset, key in enumerate(STORE_KEYS, start=1):
        path = output_dir / f"store-{key}.json"
        write_json(path, event_tx("store_code", {"code_id": str(7000 + offset)}, f"store-{key}"))
        written.append(path)

    for offset, key in enumerate(ADDRESS_KEYS, start=1):
        path = output_dir / f"instantiate-{key}.json"
        write_json(
            path,
            event_tx("instantiate", {"_contract_address": synthetic_address(offset, key)}, f"instantiate-{key}"),
        )
        written.append(path)

    print(f"OK: wrote synthetic Astroport-Juno v1 tx JSON files to {output_dir}")
    print(f"store_txs={len(STORE_KEYS)} instantiate_txs={len(ADDRESS_KEYS)} total={len(written)}")


if __name__ == "__main__":
    main()
