#!/usr/bin/env python3
"""Self-test final Astroport-Juno v1 deployment command bundling."""
from __future__ import annotations

import pathlib
import subprocess
import sys
import tempfile
from typing import NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
BUILDER = ROOT / "scripts" / "build_juno_v1_deployment_command.py"

TX_SET_LINES = [
    "--set code_ids.astroport-factory='101'",
    "--set code_ids.astroport-incentives='102'",
    "--set code_ids.astroport-native-coin-registry='103'",
    "--set code_ids.astroport-oracle='104'",
    "--set code_ids.astroport-pair='105'",
    "--set code_ids.astroport-router='106'",
    "--set code_ids.astroport-tokenfactory-tracker='107'",
    "--set code_ids.astroport-whitelist='108'",
    "--set code_ids.cw20-base='109'",
    "--set addresses.astroport-factory='juno1factory000000000000000000000000000000000'",
    "--set addresses.astroport-incentives='juno1incentives00000000000000000000000000000'",
    "--set addresses.astroport-native-coin-registry='juno1registry0000000000000000000000000000000'",
    "--set addresses.astroport-oracle='juno1oracle0000000000000000000000000000000000'",
    "--set addresses.astroport-router='juno1router0000000000000000000000000000000000'",
    "--set addresses.astroport-tokenfactory-tracker='juno1tracker00000000000000000000000000000000'",
    "--set addresses.astroport-whitelist='juno1whitelist000000000000000000000000000000'",
]


def fail(message: str) -> NoReturn:
    print(f"FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def run(args: list[str], *, expect_ok: bool = True) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        [sys.executable, str(BUILDER), *args],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if expect_ok and proc.returncode != 0:
        fail(f"builder failed for {args!r}: stdout={proc.stdout!r} stderr={proc.stderr!r}")
    if not expect_ok and proc.returncode == 0:
        fail(f"builder unexpectedly succeeded for {args!r}: stdout={proc.stdout!r}")
    return proc


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="juno-v1-deployment-command-") as raw_tmp:
        tmp = pathlib.Path(raw_tmp)
        tx_sets = tmp / "tx-sets.txt"
        rendered = tmp / "juno-v1-filled.json"
        tx_sets.write_text("\n".join(TX_SET_LINES) + "\n")

        common_args = [
            "--tx-sets",
            str(tx_sets),
            "--owner",
            "juno1owner0000000000000000000000000000000000",
            "--guardian",
            "juno1guardian00000000000000000000000000000000",
            "--treasury",
            "juno1treasury00000000000000000000000000000000",
            "--tokenfactory-module",
            "juno1factorymodule0000000000000000000000000000",
            "--counterparty-denom",
            "ibc/0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF",
            "--output",
            str(rendered),
        ]

        dry = run(common_args).stdout
        for needle in (
            "scripts/fill_juno_v1_deployment_config.py",
            "--require-complete",
            "--set",
            "sets=21 tx_sets=16 manual_sets=5 render=False",
        ):
            if needle not in dry:
                fail(f"dry command output missing {needle!r}: {dry!r}")

        rendered_proc = run([*common_args, "--render"]).stdout
        for needle in (
            "sets=21 tx_sets=16 manual_sets=5 render=True",
            "OK: wrote rendered Juno v1 deployment config",
            "OK: Juno v1 deployment template matches instantiate schema requirements",
            "pair_type=xyk",
        ):
            if needle not in rendered_proc:
                fail(f"render output missing {needle!r}: {rendered_proc!r}")
        if not rendered.exists():
            fail("render mode did not create output config")

        incomplete = tmp / "incomplete-tx-sets.txt"
        incomplete.write_text("\n".join(TX_SET_LINES[:-1]) + "\n")
        bad = run([*common_args[:1], str(incomplete), *common_args[2:]], expect_ok=False)
        if "tx sets missing required deployment values" not in bad.stderr:
            fail(f"incomplete tx-set failure was not explicit: {bad.stderr!r}")

    print("OK: Juno v1 deployment command builder combines tx sets and manual values")
    print("sets=21 tx_sets=16 manual_sets=5 render_guard=true failure_cases=1")


if __name__ == "__main__":
    main()
