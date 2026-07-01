#!/usr/bin/env python3
"""Self-test final Astroport-Juno v1 deployment command bundling."""
from __future__ import annotations

import pathlib
import json
import subprocess
import sys
import tempfile
from typing import NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
BUILDER = ROOT / "scripts" / "build_juno_v1_deployment_command.py"
MAINNET_GUIDE = ROOT / "deployment" / "MAINNET_DEPLOYMENT.md"
READINESS_PLAN = ROOT / "deployment" / "juno-v1-readiness-plan.md"

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
            "sets=24 tx_sets=16 manual_sets=5 network=uni-7 render=False",
        ):
            if needle not in dry:
                fail(f"dry command output missing {needle!r}: {dry!r}")

        rendered_proc = run([*common_args, "--render"]).stdout
        for needle in (
            "sets=24 tx_sets=16 manual_sets=5 network=uni-7 render=True",
            "OK: wrote rendered Juno v1 deployment config",
            "OK: Juno v1 deployment template matches instantiate schema requirements",
            "first_pool_gate=permissioned",
        ):
            if needle not in rendered_proc:
                fail(f"render output missing {needle!r}: {rendered_proc!r}")
        if not rendered.exists():
            fail("render mode did not create output config")

        mainnet_rendered = tmp / "juno-v1-mainnet.json"
        mainnet_proc = run([*common_args[:-2], "--output", str(mainnet_rendered), "--network", "juno-1", "--render"]).stdout
        if "network=juno-1" not in mainnet_proc:
            fail(f"mainnet render did not report juno-1 network: {mainnet_proc!r}")
        mainnet = json.loads(mainnet_rendered.read_text())
        expected_mainnet_network = {
            "chain_id": "juno-1",
            "bech32_prefix": "juno",
            "fee_denom": "ujuno",
            "native_asset_denom": "ujuno",
        }
        if mainnet.get("network") != expected_mainnet_network:
            fail(f"mainnet render inherited wrong network: {mainnet.get('network')!r}")
        factory_pair_config = mainnet["instantiate_msgs"]["astroport-factory"]["pair_configs"][0]
        if factory_pair_config.get("permissioned") is not True:
            fail("mainnet factory instantiate must keep XYK permissioned before the first-pool gate")
        final_pair_config = mainnet["post_update_state"]["astroport-factory"]["pair_configs"][0]
        if final_pair_config.get("permissioned") is not False:
            fail("mainnet post-update state must document permissionless opening after the first-pool gate")

        unsafe_mainnet = run([*common_args[:-2], "--output", str(mainnet_rendered), "--render"], expect_ok=False)
        if "--network juno-1" not in unsafe_mainnet.stderr:
            fail(f"mainnet output without network override was not rejected: {unsafe_mainnet.stderr!r}")

        incomplete = tmp / "incomplete-tx-sets.txt"
        incomplete.write_text("\n".join(TX_SET_LINES[:-1]) + "\n")
        bad = run([*common_args[:1], str(incomplete), *common_args[2:]], expect_ok=False)
        if "tx sets missing required deployment values" not in bad.stderr:
            fail(f"incomplete tx-set failure was not explicit: {bad.stderr!r}")

    mainnet_guide = MAINNET_GUIDE.read_text()
    for needle in (
        "--network juno-1",
        "deployment/juno-v1-mainnet.json",
        "junod query tx",
        "save the included tx response",
        "Keep XYK pair creation permissioned",
        "Query factory pair registry and pool balances",
    ):
        if needle not in mainnet_guide:
            fail(f"mainnet deployment guide missing required text: {needle}")

    readiness_plan = READINESS_PLAN.read_text()
    for needle in (
        "`permissioned=true` during the first-pool gate",
        "official first pair is registered, seeded, and smoke-checked",
        "Open public pair creation only after the first-pool gate passes",
    ):
        if needle not in readiness_plan:
            fail(f"readiness plan missing first-pool gate text: {needle}")

    print("OK: Juno v1 deployment command builder combines tx sets and manual values")
    print("sets=24 tx_sets=16 manual_sets=5 network_sets=3 render_guard=true failure_cases=2 mainnet_network=juno-1")


if __name__ == "__main__":
    main()
