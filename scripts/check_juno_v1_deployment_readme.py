#!/usr/bin/env python3
"""Validate the Astroport-Juno v1 deployment README handoff.

The README is the operator/frontend bridge for uni-7. This guard keeps its
manual value checklist, render command, dry-run rehearsal, and frontend
consumption snippet aligned with the dependency-free deployment helpers.
"""
from __future__ import annotations

import pathlib
import re
import sys
from typing import NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
README = ROOT / "deployment" / "README.md"
TYPES = ROOT / "deployment" / "juno-v1-frontend-config.d.ts"
EXAMPLE = ROOT / "deployment" / "juno-v1-frontend-config.example.ts"
TEMPLATE = ROOT / "deployment" / "juno-v1-testnet.template.json"

ACCOUNT_SETS = (
    "accounts.owner",
    "accounts.guardian",
    "accounts.treasury",
    "accounts.tokenfactory_module",
)
CODE_ID_SETS = (
    "code_ids.astroport-factory",
    "code_ids.astroport-incentives",
    "code_ids.astroport-native-coin-registry",
    "code_ids.astroport-oracle",
    "code_ids.astroport-pair",
    "code_ids.astroport-router",
    "code_ids.astroport-tokenfactory-tracker",
    "code_ids.astroport-whitelist",
    "code_ids.cw20-base",
)
ADDRESS_SETS = (
    "addresses.astroport-factory",
    "addresses.astroport-incentives",
    "addresses.astroport-native-coin-registry",
    "addresses.astroport-oracle",
    "addresses.astroport-router",
    "addresses.astroport-tokenfactory-tracker",
    "addresses.astroport-whitelist",
)
PAIR_SET = "pair_create_msg_template.asset_infos.1.native_token.denom"
REQUIRED_SECTIONS = (
    "## Required values after upload / instantiate",
    "## Extract values from tx JSON",
    "## Render command shape",
    "## Frontend consumption",
    "## Scope guardrails",
)
REQUIRED_COMMANDS = (
    "python3 scripts/generate_juno_v1_dry_run_txs.py --output-dir deployment/tx/uni-7-dry-run",
    "python3 scripts/check_juno_v1_dry_run_txs.py",
    "python3 scripts/extract_juno_v1_tx_sets.py",
    "python3 scripts/fill_juno_v1_deployment_config.py",
    "python3 scripts/check_juno_v1_deployment_template.py deployment/juno-v1-testnet.json",
)
FRONTEND_SNIPPET = (
    'import deployment from "./juno-v1-testnet.json";',
    'import type { JunoV1FrontendDeploymentConfig } from "./juno-v1-frontend-config";',
    "const config = deployment satisfies JunoV1FrontendDeploymentConfig;",
)
SCOPE_GUARDRAILS = (
    "v1 is XYK-only and permissionless.",
    "No new DEX token is introduced; incentives use the configured native denom.",
    "Do not add stable pairs, LSTs, perps, or yield surfaces to this config.",
    "discover pools through factory queries",
)


def fail(message: str) -> NoReturn:
    print(f"FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def require_once(text: str, needle: str, label: str | None = None) -> None:
    count = text.count(needle)
    if count != 1:
        fail(f"expected exactly one {label or needle!r}, found {count}")


def main() -> None:
    try:
        text = README.read_text()
    except FileNotFoundError:
        fail("missing deployment/README.md")

    for path in (TYPES, EXAMPLE, TEMPLATE):
        if not path.exists():
            fail(f"README references handoff file that is missing: {path.relative_to(ROOT)}")

    for section in REQUIRED_SECTIONS:
        require_once(text, section, f"README section {section}")

    for needle in REQUIRED_COMMANDS + FRONTEND_SNIPPET + SCOPE_GUARDRAILS:
        if needle not in text:
            fail(f"README missing required handoff text: {needle}")

    for key in ACCOUNT_SETS + CODE_ID_SETS + ADDRESS_SETS + (PAIR_SET,):
        # Each required value should appear once in the checklist and once in the
        # render command, preventing one side of the handoff from drifting.
        if text.count(key) < 2:
            fail(f"README must mention {key} in both checklist and render command")
        require_once(text, f"--set {key}=", f"render --set for {key}")

    if "operator-tx-checklist.md" not in text:
        fail("README must link the operator tx checklist")
    if "juno-v1-frontend-config.example.ts" not in text:
        fail("README must link the frontend TypeScript example")
    if not re.search(r"first pool form can start from `config\.pair_create_msg_template`", text):
        fail("README must keep first-pool template as a form seed, not a hardcoded pool")
    if re.search(r"stable|PCL|LST|perps|yield", text, flags=re.IGNORECASE) and "Do not add stable pairs, LSTs, perps, or yield surfaces" not in text:
        fail("README has deferred-scope words without the explicit v1 guardrail")

    print("OK: Juno v1 deployment README matches operator/frontend handoff helpers")
    print(
        f"account_sets={len(ACCOUNT_SETS)} code_id_sets={len(CODE_ID_SETS)} "
        f"address_sets={len(ADDRESS_SETS)} frontend_snippet=true scope_guardrails=true"
    )


if __name__ == "__main__":
    main()
