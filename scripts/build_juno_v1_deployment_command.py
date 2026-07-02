#!/usr/bin/env python3
"""Build/render the final Astroport-Juno v1 deployment fill command.

This glues together the two handoff streams:

1. `scripts/extract_juno_v1_tx_sets.py` output from real `junod -o json`
   store/instantiate transactions.
2. Manual operator values that do not appear in tx logs: owner/guardian/treasury,
   tokenfactory module account, and the first counterparty denom for the sample
   XYK pair create message.

By default it prints a copy/paste-safe command for
`scripts/fill_juno_v1_deployment_config.py`. With `--render`, it also executes
that command and validates the rendered config with the deployment-template
schema/scope guard.
"""
from __future__ import annotations

import argparse
import pathlib
import shlex
import subprocess
import sys
from typing import NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
FILL = ROOT / "scripts" / "fill_juno_v1_deployment_config.py"
CHECK_TEMPLATE = ROOT / "scripts" / "check_juno_v1_deployment_template.py"

REQUIRED_TX_SET_PATHS = {
    "code_ids.astroport-factory",
    "code_ids.astroport-incentives",
    "code_ids.astroport-native-coin-registry",
    "code_ids.astroport-oracle",
    "code_ids.astroport-pair",
    "code_ids.astroport-router",
    "code_ids.astroport-tokenfactory-tracker",
    "code_ids.astroport-whitelist",
    "code_ids.cw20-base",
    "addresses.astroport-factory",
    "addresses.astroport-incentives",
    "addresses.astroport-native-coin-registry",
    "addresses.astroport-oracle",
    "addresses.astroport-router",
    "addresses.astroport-tokenfactory-tracker",
    "addresses.astroport-whitelist",
}

MANUAL_SET_PATHS = {
    "accounts.owner",
    "accounts.guardian",
    "accounts.treasury",
    "accounts.tokenfactory_module",
    "pair_create_msg_template.asset_infos.1.native_token.denom",
}

NETWORKS = {
    "uni-7": {
        "network.chain_id": "uni-7",
        "network.fee_denom": "ujunox",
        "network.native_asset_denom": "ujunox",
    },
    "juno-1": {
        "network.chain_id": "juno-1",
        "network.fee_denom": "ujuno",
        "network.native_asset_denom": "ujuno",
    },
}
NETWORK_SET_PATHS = set(next(iter(NETWORKS.values())))


def fail(message: str) -> NoReturn:
    print(f"FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def parse_set_assignment(raw: str) -> tuple[str, str]:
    if "=" not in raw:
        fail(f"--set assignment must be dotted.path=value, got {raw!r}")
    path, value = raw.split("=", 1)
    if not path or not value:
        fail(f"--set assignment must include non-empty path and value, got {raw!r}")
    return path, value


def parse_extractor_sets(path: pathlib.Path) -> list[str]:
    try:
        lines = path.read_text().splitlines()
    except FileNotFoundError:
        fail(f"missing tx sets file: {path}")

    assignments: list[str] = []
    for line_no, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        parts = shlex.split(stripped)
        if len(parts) != 2 or parts[0] != "--set":
            fail(f"{path}:{line_no} expected extractor line like `--set path=value`, got {line!r}")
        assignments.append(parts[1])
    if not assignments:
        fail(f"no --set assignments found in {path}")
    return assignments


def add_assignment(assignments: dict[str, str], assignment: str, source: str) -> None:
    path, value = parse_set_assignment(assignment)
    previous = assignments.get(path)
    if previous is not None and previous != value:
        fail(f"conflicting values for {path}: {previous!r} vs {value!r} from {source}")
    assignments[path] = value


def shell_command(assignments: dict[str, str], output: pathlib.Path) -> str:
    args = [
        "python3",
        "scripts/fill_juno_v1_deployment_config.py",
        "--output",
        str(output),
        "--require-complete",
    ]
    for path in sorted(assignments):
        args.extend(["--set", f"{path}={assignments[path]}"])
    return " \\\n  ".join(shlex.quote(arg) for arg in args)


def render(assignments: dict[str, str], output: pathlib.Path) -> None:
    args = [sys.executable, str(FILL), "--output", str(output), "--require-complete"]
    for path in sorted(assignments):
        args.extend(["--set", f"{path}={assignments[path]}"])
    fill_proc = subprocess.run(args, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if fill_proc.returncode != 0:
        fail(f"fill command failed:\nstdout={fill_proc.stdout}\nstderr={fill_proc.stderr}")
    print(fill_proc.stdout, end="")

    check_proc = subprocess.run(
        [sys.executable, str(CHECK_TEMPLATE), str(output)],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if check_proc.returncode != 0:
        fail(f"rendered config failed template guard:\nstdout={check_proc.stdout}\nstderr={check_proc.stderr}")
    print(check_proc.stdout, end="")


def reject_unsafe_mainnet_output(network: str, output: pathlib.Path) -> None:
    if "mainnet" in output.name and network != "juno-1":
        fail("mainnet deployment output requires --network juno-1")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tx-sets", type=pathlib.Path, required=True, help="file containing extractor `--set ...` lines")
    parser.add_argument("--owner", required=True)
    parser.add_argument("--guardian", required=True)
    parser.add_argument("--treasury", required=True)
    parser.add_argument("--tokenfactory-module", required=True)
    parser.add_argument("--counterparty-denom", required=True, help="ibc/... denom for the sample JUNO/counterparty XYK pair-create template")
    parser.add_argument("--output", type=pathlib.Path, default=pathlib.Path("deployment/juno-v1-testnet.filled.json"))
    parser.add_argument("--network", choices=sorted(NETWORKS), default="uni-7", help="deployment network values to render into the config")
    parser.add_argument("--render", action="store_true", help="execute the fill command and validate the rendered config")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    assignments: dict[str, str] = {}
    reject_unsafe_mainnet_output(args.network, args.output)

    for assignment in parse_extractor_sets(args.tx_sets):
        add_assignment(assignments, assignment, str(args.tx_sets))

    manual = {
        "accounts.owner": args.owner,
        "accounts.guardian": args.guardian,
        "accounts.treasury": args.treasury,
        "accounts.tokenfactory_module": args.tokenfactory_module,
        "pair_create_msg_template.asset_infos.1.native_token.denom": args.counterparty_denom,
    }
    for path, value in manual.items():
        add_assignment(assignments, f"{path}={value}", "manual arg")
    for path, value in NETWORKS[args.network].items():
        add_assignment(assignments, f"{path}={value}", f"network {args.network}")

    missing_tx = sorted(REQUIRED_TX_SET_PATHS - assignments.keys())
    if missing_tx:
        fail("tx sets missing required deployment values: " + ", ".join(missing_tx))
    extra_tx = sorted(path for path in assignments if path not in REQUIRED_TX_SET_PATHS | MANUAL_SET_PATHS | NETWORK_SET_PATHS)
    if extra_tx:
        fail("unexpected deployment set paths: " + ", ".join(extra_tx))

    command = shell_command(assignments, args.output)
    print(command)
    print(f"sets={len(assignments)} tx_sets={len(REQUIRED_TX_SET_PATHS)} manual_sets={len(MANUAL_SET_PATHS)} network={args.network} render={args.render}")

    if args.render:
        render(assignments, args.output)


if __name__ == "__main__":
    main()
