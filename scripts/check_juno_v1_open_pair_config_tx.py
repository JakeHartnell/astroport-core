#!/usr/bin/env python3
"""Self-test the Juno v1 post-smoke open-XYK tx builder."""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import tempfile
from typing import NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
BUILDER = ROOT / "scripts" / "build_juno_v1_open_pair_config_tx.py"
FILL = ROOT / "scripts" / "fill_juno_v1_deployment_config.py"
README = ROOT / "deployment" / "README.md"
CHECKLIST = ROOT / "deployment" / "operator-tx-checklist.md"

SETS = [
    "accounts.owner=juno1owner0000000000000000000000000000000000",
    "accounts.guardian=juno1guardian00000000000000000000000000000000",
    "accounts.treasury=juno1treasury00000000000000000000000000000000",
    "accounts.tokenfactory_module=juno1factorymodule0000000000000000000000000000",
    "code_ids.astroport-factory=101",
    "code_ids.astroport-incentives=102",
    "code_ids.astroport-native-coin-registry=103",
    "code_ids.astroport-oracle=104",
    "code_ids.astroport-pair=105",
    "code_ids.astroport-router=106",
    "code_ids.astroport-tokenfactory-tracker=107",
    "code_ids.astroport-whitelist=108",
    "code_ids.cw20-base=109",
    "addresses.astroport-factory=juno1factory000000000000000000000000000000000",
    "addresses.astroport-incentives=juno1incentives00000000000000000000000000000",
    "addresses.astroport-native-coin-registry=juno1registry0000000000000000000000000000000",
    "addresses.astroport-oracle=juno1oracle0000000000000000000000000000000000",
    "addresses.astroport-router=juno1router0000000000000000000000000000000000",
    "addresses.astroport-tokenfactory-tracker=juno1tracker00000000000000000000000000000000",
    "addresses.astroport-whitelist=juno1whitelist000000000000000000000000000000",
    "pair_create_msg_template.asset_infos.1.native_token.denom=ibc/0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF",
]


def fail(message: str) -> NoReturn:
    print(f"FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def run_builder(config: pathlib.Path, *extra: str, expect_ok: bool = True) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        [sys.executable, str(BUILDER), "--config", str(config), "--from", "juno-deployer", *extra],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if expect_ok and proc.returncode != 0:
        fail(f"open tx builder failed: stdout={proc.stdout!r} stderr={proc.stderr!r}")
    if not expect_ok and proc.returncode == 0:
        fail(f"open tx builder unexpectedly succeeded: stdout={proc.stdout!r}")
    return proc


def render_config(path: pathlib.Path) -> None:
    args = [sys.executable, str(FILL), "--output", str(path), "--require-complete"]
    for item in SETS:
        args.extend(["--set", item])
    proc = subprocess.run(args, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0:
        fail(f"fill script failed: stdout={proc.stdout!r} stderr={proc.stderr!r}")


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="juno-v1-open-pair-") as raw_tmp:
        tmp = pathlib.Path(raw_tmp)
        rendered = tmp / "juno-v1-testnet.json"
        render_config(rendered)

        proc = run_builder(rendered, "--fees", "7500ujunox")
        for needle in (
            "Execute only after the first pool is registered, seeded, and smoke-checked.",
            '"update_pair_config"',
            '"permissioned": false',
            '"code_id": 105',
            "junod tx wasm execute juno1factory000000000000000000000000000000000",
            "--from juno-deployer --chain-id uni-7 --gas auto --gas-adjustment 1.3 --output json --fees 7500ujunox",
            "deployment/tx/uni-7/update-pair-config-open-xyk.json",
            "open_pair_config_tx=ready chain_id=uni-7",
        ):
            if needle not in proc.stdout:
                fail(f"builder output missing {needle!r}: {proc.stdout!r}")

        bad_permissioned = json.loads(rendered.read_text())
        bad_permissioned["post_update_state"]["astroport-factory"]["pair_configs"][0]["permissioned"] = True
        bad_permissioned_path = tmp / "bad-permissioned.json"
        bad_permissioned_path.write_text(json.dumps(bad_permissioned))
        bad = run_builder(bad_permissioned_path, expect_ok=False)
        if "permissioned=false" not in bad.stderr:
            fail(f"permissioned drift failure was not explicit: {bad.stderr!r}")

        bad_code_id = json.loads(rendered.read_text())
        bad_code_id["post_update_state"]["astroport-factory"]["pair_configs"][0]["code_id"] = 999
        bad_code_id_path = tmp / "bad-code-id.json"
        bad_code_id_path.write_text(json.dumps(bad_code_id))
        bad_code = run_builder(bad_code_id_path, expect_ok=False)
        if "preserve code_id" not in bad_code.stderr and "code_id must match" not in bad_code.stderr:
            fail(f"code-id drift failure was not explicit: {bad_code.stderr!r}")

    readme = README.read_text()
    checklist = CHECKLIST.read_text()
    for needle in (
        "scripts/build_juno_v1_open_pair_config_tx.py",
        "update-pair-config-open-xyk.json",
        "first pool is registered, seeded, and smoke-checked",
    ):
        if needle not in readme and needle not in checklist:
            fail(f"operator docs missing open-pair tx helper text: {needle}")

    print("OK: Juno v1 open-pair-config tx builder emits the guarded post-smoke command")
    print("open_pair_config_tx=true permissioned_false=true preserves_xyk_config=true failure_cases=2")


if __name__ == "__main__":
    main()
