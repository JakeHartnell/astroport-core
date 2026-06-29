#!/usr/bin/env python3
"""Self-test the Astroport-Juno tx JSON extraction helper.

The extractor sits on the deployment critical path: operators paste its output
into fill_juno_v1_deployment_config.py after uni-7 uploads/instantiates. This
check uses fixture tx response shapes instead of live chain data so CI can catch
regressions before the bakeoff.
"""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import tempfile
from typing import NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
EXTRACTOR = ROOT / "scripts" / "extract_juno_v1_tx_sets.py"


def fail(message: str) -> NoReturn:
    print(f"FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def run(args: list[str], *, expect_ok: bool = True) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        [sys.executable, str(EXTRACTOR), *args],
        cwd=ROOT,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if expect_ok and proc.returncode != 0:
        fail(f"extractor failed for {args!r}: stdout={proc.stdout!r} stderr={proc.stderr!r}")
    if not expect_ok and proc.returncode == 0:
        fail(f"extractor unexpectedly succeeded for {args!r}: stdout={proc.stdout!r}")
    return proc


def write_json(path: pathlib.Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n")


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="juno-v1-tx-extractor-") as raw_tmp:
        tmp = pathlib.Path(raw_tmp)
        store_tx = tmp / "store-factory.json"
        instantiate_tx = tmp / "instantiate-factory.json"
        raw_log_tx = tmp / "raw-log-router.json"
        multi_code_tx = tmp / "multi-code.json"

        write_json(
            store_tx,
            {
                "tx_response": {
                    "events": [
                        {
                            "type": "store_code",
                            "attributes": [
                                {"key": "code_id", "value": "77"},
                            ],
                        }
                    ]
                }
            },
        )
        write_json(
            instantiate_tx,
            {
                "logs": [
                    {
                        "events": [
                            {
                                "type": "instantiate",
                                "attributes": [
                                    {
                                        "key": "_contract_address",
                                        "value": "juno1factory000000000000000000000000000000000",
                                    }
                                ],
                            }
                        ]
                    }
                ]
            },
        )
        write_json(
            raw_log_tx,
            {
                "raw_log": json.dumps(
                    [
                        {
                            "events": [
                                {
                                    "type": "instantiate",
                                    "attributes": [
                                        {
                                            "key": "contract_address",
                                            "value": "juno1router0000000000000000000000000000000000",
                                        }
                                    ],
                                }
                            ]
                        }
                    ]
                )
            },
        )
        write_json(
            multi_code_tx,
            {
                "events": [
                    {"type": "store_code", "attributes": [{"key": "code_id", "value": "77"}]},
                    {"type": "store_code", "attributes": [{"key": "code_id", "value": "78"}]},
                ]
            },
        )

        mapped = run(
            [
                "--code-id",
                f"astroport-factory={store_tx}",
                "--address",
                f"astroport-factory={instantiate_tx}",
                "--address",
                f"astroport-router={raw_log_tx}",
            ]
        ).stdout.splitlines()
        expected = [
            "--set code_ids.astroport-factory='77'",
            "--set addresses.astroport-factory='juno1factory000000000000000000000000000000000'",
            "--set addresses.astroport-router='juno1router0000000000000000000000000000000000'",
        ]
        if mapped != expected:
            fail(f"mapped output mismatch:\nexpected={expected!r}\nactual={mapped!r}")

        scan = run(["--scan", str(store_tx), str(instantiate_tx), str(raw_log_tx)]).stdout
        for needle in (
            "code_ids=77",
            "addresses=juno1factory000000000000000000000000000000000",
            "addresses=juno1router0000000000000000000000000000000000",
        ):
            if needle not in scan:
                fail(f"scan output missing {needle!r}: {scan!r}")

        bad_key = run(["--code-id", f"not-a-contract={store_tx}"], expect_ok=False)
        if "unknown code-id key" not in bad_key.stderr:
            fail(f"bad-key failure did not explain key error: {bad_key.stderr!r}")

        multi = run(["--code-id", f"astroport-factory={multi_code_tx}"], expect_ok=False)
        if "multiple code_ids" not in multi.stderr:
            fail(f"multi-code failure did not explain ambiguity: {multi.stderr!r}")

    print("OK: Juno v1 tx extractor handles mapped, scan, raw_log, and failure cases")
    print("fixtures=4 mapped_sets=3 failure_cases=2")


if __name__ == "__main__":
    main()
