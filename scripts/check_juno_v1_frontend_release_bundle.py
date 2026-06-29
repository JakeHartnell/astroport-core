#!/usr/bin/env python3
"""Smoke-test the Astroport-Juno v1 frontend release bundle helper."""
from __future__ import annotations

import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile
import zipfile
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[1]
FILL = ROOT / "scripts" / "fill_juno_v1_deployment_config.py"
BUNDLE = ROOT / "scripts" / "build_juno_v1_frontend_release_bundle.py"

SET_VALUES = {
    "accounts.owner": "juno1bundleowner00000000000000000000000000",
    "accounts.guardian": "juno1bundleguardian0000000000000000000000",
    "accounts.treasury": "juno1bundletreasury0000000000000000000000",
    "accounts.tokenfactory_module": "juno1bundletokenfactory000000000000000000",
    "code_ids.astroport-factory": "101",
    "code_ids.astroport-incentives": "102",
    "code_ids.astroport-native-coin-registry": "103",
    "code_ids.astroport-oracle": "104",
    "code_ids.astroport-pair": "105",
    "code_ids.astroport-router": "106",
    "code_ids.astroport-tokenfactory-tracker": "107",
    "code_ids.astroport-whitelist": "108",
    "code_ids.cw20-base": "109",
    "addresses.astroport-factory": "juno1bundlefactory0000000000000000000000",
    "addresses.astroport-incentives": "juno1bundleincentives000000000000000000",
    "addresses.astroport-native-coin-registry": "juno1bundleregistry00000000000000000000",
    "addresses.astroport-oracle": "juno1bundleoracle00000000000000000000000",
    "addresses.astroport-router": "juno1bundlerouter00000000000000000000000",
    "addresses.astroport-tokenfactory-tracker": "juno1bundletracker000000000000000000000",
    "addresses.astroport-whitelist": "juno1bundlewhitelist00000000000000000000",
    "pair_create_msg_template.asset_infos.1.native_token.denom": "ibc/BUNDLECOUNTERPARTYDENOM0000000000000000000000000000000000000000000000000000",
}

EXPECTED_FILES = {
    "juno-v1-testnet.json",
    "juno-v1-frontend-config.d.ts",
    "juno-v1-frontend-config.example.ts",
    "MANIFEST.json",
}
FORBIDDEN_FILES = {
    "juno-v1-testnet.template.json",
    "tx-sets.txt",
}


def run(args: list[str]) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(args, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0:
        raise SystemExit(
            f"FAIL: command failed: {' '.join(args)}\nstdout={proc.stdout}\nstderr={proc.stderr}"
        )
    return proc


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def manifest_files(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    files = manifest.get("files")
    if not isinstance(files, list):
        raise SystemExit("FAIL: manifest.files must be a list")
    mapped: dict[str, dict[str, Any]] = {}
    for item in files:
        if not isinstance(item, dict) or not isinstance(item.get("path"), str):
            raise SystemExit("FAIL: manifest file entries must be objects with path")
        mapped[item["path"]] = item
    return mapped


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="juno-v1-frontend-bundle-") as tmp:
        tmp_path = pathlib.Path(tmp)
        config = tmp_path / "juno-v1-testnet.json"
        bundle = tmp_path / "juno-v1-frontend-release.zip"

        fill_args = [sys.executable, str(FILL), "--output", str(config), "--require-complete"]
        for key, value in sorted(SET_VALUES.items()):
            fill_args.extend(["--set", f"{key}={value}"])
        fill = run(fill_args)
        if "OK: wrote rendered Juno v1 deployment config" not in fill.stdout:
            raise SystemExit("FAIL: fill helper did not render a complete config")

        built = run([sys.executable, str(BUNDLE), "--config", str(config), "--output", str(bundle)])
        if "OK: wrote Astroport-Juno v1 frontend release bundle" not in built.stdout:
            raise SystemExit("FAIL: bundle helper did not report success")
        if not bundle.exists():
            raise SystemExit("FAIL: bundle zip was not written")

        with zipfile.ZipFile(bundle, "r") as archive:
            names = set(archive.namelist())
            if names != EXPECTED_FILES:
                raise SystemExit(f"FAIL: unexpected bundle file set: {sorted(names)}")
            forbidden = sorted(names & FORBIDDEN_FILES)
            if forbidden:
                raise SystemExit("FAIL: bundle includes forbidden files: " + ", ".join(forbidden))
            manifest = json.loads(archive.read("MANIFEST.json"))
            file_meta = manifest_files(manifest)
            for name in EXPECTED_FILES - {"MANIFEST.json"}:
                data = archive.read(name)
                meta = file_meta.get(name)
                if not meta:
                    raise SystemExit(f"FAIL: manifest missing {name}")
                if meta.get("bytes") != len(data):
                    raise SystemExit(f"FAIL: manifest byte count mismatch for {name}")
                if meta.get("sha256") != sha256(data):
                    raise SystemExit(f"FAIL: manifest sha256 mismatch for {name}")
            if manifest.get("scope") != "xyk-only, permissionless, no DEX token":
                raise SystemExit("FAIL: manifest scope guardrail drifted")
            if manifest.get("required_frontend_addresses") != [
                "astroport-factory",
                "astroport-router",
                "astroport-native-coin-registry",
                "astroport-incentives",
            ]:
                raise SystemExit("FAIL: manifest required frontend addresses drifted")

        rejected = subprocess.run(
            [
                sys.executable,
                str(BUNDLE),
                "--config",
                str(ROOT / "deployment" / "juno-v1-testnet.template.json"),
                "--output",
                str(tmp_path / "bad.zip"),
            ],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if rejected.returncode == 0 or "refusing to package the placeholder" not in rejected.stderr:
            raise SystemExit("FAIL: bundle helper must reject the placeholder template")

        print("OK: Juno v1 frontend release bundle packages only verified handoff files")
        print("bundle_entries=4 manifest_hashes=3 rejects_template=true")


if __name__ == "__main__":
    main()
