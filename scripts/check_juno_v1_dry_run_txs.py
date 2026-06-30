#!/usr/bin/env python3
"""Smoke-test the Astroport-Juno v1 dry-run tx fixture generator."""
from __future__ import annotations

import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "scripts" / "generate_juno_v1_dry_run_txs.py"
EXTRACTOR = ROOT / "scripts" / "extract_juno_v1_tx_sets.py"
BUILDER = ROOT / "scripts" / "build_juno_v1_deployment_command.py"
CHECK_FRONTEND = ROOT / "scripts" / "check_juno_v1_frontend_config.py"

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


def run(args: list[str], cwd: pathlib.Path = ROOT) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(args, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0:
        raise SystemExit(
            f"FAIL: command failed: {' '.join(args)}\nstdout={proc.stdout}\nstderr={proc.stderr}"
        )
    return proc


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="juno-v1-dry-run-") as tmp:
        tx_dir = pathlib.Path(tmp) / "tx"
        out_cfg = pathlib.Path(tmp) / "juno-v1-testnet.json"
        tx_sets = pathlib.Path(tmp) / "tx-sets.txt"

        gen = run([sys.executable, str(GENERATOR), "--output-dir", str(tx_dir)])
        expected_files = [tx_dir / f"store-{key}.json" for key in STORE_KEYS] + [
            tx_dir / f"instantiate-{key}.json" for key in ADDRESS_KEYS
        ]
        missing = [str(path) for path in expected_files if not path.exists()]
        if missing:
            raise SystemExit("FAIL: generator missed files: " + ", ".join(missing))

        extractor_args = [sys.executable, str(EXTRACTOR)]
        for key in STORE_KEYS:
            extractor_args.extend(["--code-id", f"{key}={tx_dir / f'store-{key}.json'}"])
        for key in ADDRESS_KEYS:
            extractor_args.extend(["--address", f"{key}={tx_dir / f'instantiate-{key}.json'}"])
        extracted = run(extractor_args)
        tx_sets.write_text(extracted.stdout)
        tx_set_lines = [line for line in extracted.stdout.splitlines() if line.strip()]
        if len(tx_set_lines) != 16:
            raise SystemExit(f"FAIL: expected 16 tx set lines, got {len(tx_set_lines)}")

        rendered = run(
            [
                sys.executable,
                str(BUILDER),
                "--tx-sets",
                str(tx_sets),
                "--owner",
                "juno1dryrunowner000000000000000000000000000",
                "--guardian",
                "juno1dryrunguardian000000000000000000000000",
                "--treasury",
                "juno1dryruntreasury000000000000000000000000",
                "--tokenfactory-module",
                "juno1dryruntokenfactory000000000000000000000",
                "--counterparty-denom",
                "ibc/DRYRUNCOUNTERPARTYDENOM0000000000000000000000000000000000000000000000000000",
                "--output",
                str(out_cfg),
                "--render",
            ]
        )
        if "OK: Juno v1 deployment template matches instantiate schema requirements" not in rendered.stdout:
            raise SystemExit("FAIL: rendered dry-run config did not pass template guard")

        frontend = run([sys.executable, str(CHECK_FRONTEND), str(out_cfg)])
        if "OK: Juno v1 frontend config handoff is internally consistent" not in frontend.stdout:
            raise SystemExit("FAIL: rendered dry-run config did not pass frontend guard")

        print(
            "OK: Juno v1 dry-run tx fixtures exercise "
            "generator -> extractor -> builder -> template guard -> frontend guard"
        )
        print("fixture_files=16 tx_sets=16 render_guard=true frontend_guard=true")
        print(gen.stdout.splitlines()[-1])


if __name__ == "__main__":
    main()
