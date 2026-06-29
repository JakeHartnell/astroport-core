#!/usr/bin/env python3
"""Package the verified Astroport-Juno v1 frontend handoff files.

The bundle is intentionally narrow: a rendered uni-7 deployment config, the
Juno v1 TypeScript declaration, the optional example fixture, and a manifest
with sha256/size metadata. It does not include the placeholder template, tx
logs, wasm artifacts, or any deferred DEX surfaces.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import subprocess
import sys
import zipfile
from typing import Any, NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "deployment" / "juno-v1-testnet.json"
DEFAULT_TYPES = ROOT / "deployment" / "juno-v1-frontend-config.d.ts"
DEFAULT_EXAMPLE = ROOT / "deployment" / "juno-v1-frontend-config.example.ts"
DEFAULT_OUTPUT = ROOT / "deployment" / "juno-v1-frontend-release.zip"
CHECK_TEMPLATE = ROOT / "scripts" / "check_juno_v1_deployment_template.py"
CHECK_FRONTEND = ROOT / "scripts" / "check_juno_v1_frontend_config.py"
GENERATE_TYPES = ROOT / "scripts" / "generate_juno_v1_frontend_types.py"
CHECK_EXAMPLE = ROOT / "scripts" / "check_juno_v1_frontend_example.py"
CHECK_SYNC = ROOT / "scripts" / "check_juno_v1_frontend_handoff_sync.py"

BUNDLE_CONFIG_NAME = "juno-v1-testnet.json"
BUNDLE_TYPES_NAME = "juno-v1-frontend-config.d.ts"
BUNDLE_EXAMPLE_NAME = "juno-v1-frontend-config.example.ts"
BUNDLE_MANIFEST_NAME = "MANIFEST.json"
FORBIDDEN_NAMES = {
    "juno-v1-testnet.template.json",
    "tx-sets.txt",
}
FORBIDDEN_SUBSTRINGS = (
    "stable",
    "concentrated",
    "pcl",
    "xastro",
    "vesting",
    "maker",
    "perps",
    "lst",
)
FORBIDDEN_CONTENT_SUBSTRINGS = tuple(
    fragment for fragment in FORBIDDEN_SUBSTRINGS if fragment not in {"maker", "vesting"}
)


def fail(message: str) -> NoReturn:
    print(f"FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def repo_relative(path: pathlib.Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def run(args: list[str]) -> str:
    proc = subprocess.run(args, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0:
        fail(f"command failed: {' '.join(args)}\nstdout={proc.stdout}\nstderr={proc.stderr}")
    return proc.stdout


def read_bytes(path: pathlib.Path) -> bytes:
    try:
        return path.read_bytes()
    except FileNotFoundError:
        fail(f"missing release input: {repo_relative(path)}")


def load_config(path: pathlib.Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text())
    except FileNotFoundError:
        fail(f"missing release config: {repo_relative(path)}")
    except json.JSONDecodeError as exc:
        fail(f"invalid release config JSON: {exc}")
    if not isinstance(data, dict):
        fail("release config must be a JSON object")
    return data


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def assert_not_template(config: dict[str, Any]) -> None:
    text = json.dumps(config, sort_keys=True).lower()
    for marker in ("todo", "placeholder", "replace-me"):
        if marker in text:
            fail(f"release config still contains placeholder marker: {marker}")


def assert_bundle_scope(entries: dict[str, bytes]) -> None:
    for name, data in entries.items():
        lower_name = name.lower()
        if name in FORBIDDEN_NAMES or lower_name.startswith("tx/") or lower_name.endswith(".wasm"):
            fail(f"forbidden file in frontend bundle: {name}")
        if any(fragment in lower_name for fragment in FORBIDDEN_SUBSTRINGS):
            fail(f"forbidden deferred-scope filename in frontend bundle: {name}")
        if name.endswith((".json", ".ts")):
            text = data.decode("utf-8", errors="ignore").lower()
            bad = [fragment for fragment in FORBIDDEN_CONTENT_SUBSTRINGS if fragment in text]
            # The v1 config still carries schema-required maker_fee_bps and
            # incentives vesting_contract fields, but should not mention any
            # deferred pool/DEX-token surfaces in release bundle contents.
            if bad:
                fail(f"forbidden deferred-scope text in {name}: {', '.join(sorted(set(bad)))}")


def build_manifest(entries: dict[str, bytes], config: dict[str, Any]) -> dict[str, Any]:
    frontend = config.get("frontend", {})
    network = config.get("network", {})
    addresses = config.get("addresses", {})
    return {
        "bundle": "astroport-juno-v1-frontend-release",
        "network": network.get("chain_id"),
        "native_asset_denom": network.get("native_asset_denom"),
        "scope": "xyk-only, permissionless, no DEX token",
        "pair_discovery": frontend.get("pair_discovery"),
        "required_frontend_addresses": frontend.get("required_addresses", []),
        "optional_frontend_addresses": frontend.get("optional_addresses", []),
        "address_count": len(addresses) if isinstance(addresses, dict) else None,
        "files": [
            {
                "path": name,
                "bytes": len(data),
                "sha256": sha256(data),
            }
            for name, data in entries.items()
        ],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=pathlib.Path, default=DEFAULT_CONFIG, help="rendered deployment config JSON")
    parser.add_argument("--types", type=pathlib.Path, default=DEFAULT_TYPES, help="generated TypeScript declaration")
    parser.add_argument("--example", type=pathlib.Path, default=DEFAULT_EXAMPLE, help="optional frontend example fixture")
    parser.add_argument("--output", type=pathlib.Path, default=DEFAULT_OUTPUT, help="zip bundle to write")
    parser.add_argument("--skip-example", action="store_true", help="omit the optional example fixture")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config_path = args.config.resolve()
    output_path = args.output.resolve()

    if config_path.name == "juno-v1-testnet.template.json":
        fail("refusing to package the placeholder deployment template as a frontend release")

    config = load_config(config_path)
    assert_not_template(config)

    run([sys.executable, str(CHECK_TEMPLATE), str(config_path)])
    run([sys.executable, str(CHECK_FRONTEND), str(config_path)])
    run([sys.executable, str(GENERATE_TYPES), "--check"])
    if not args.skip_example:
        run([sys.executable, str(CHECK_EXAMPLE)])
    run([sys.executable, str(CHECK_SYNC)])

    entries = {
        BUNDLE_CONFIG_NAME: json.dumps(config, indent=2, sort_keys=True).encode("utf-8") + b"\n",
        BUNDLE_TYPES_NAME: read_bytes(args.types.resolve()),
    }
    if not args.skip_example:
        entries[BUNDLE_EXAMPLE_NAME] = read_bytes(args.example.resolve())
    assert_bundle_scope(entries)

    manifest = build_manifest(entries, config)
    manifest_bytes = json.dumps(manifest, indent=2, sort_keys=True).encode("utf-8") + b"\n"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in entries.items():
            archive.writestr(name, data)
        archive.writestr(BUNDLE_MANIFEST_NAME, manifest_bytes)

    print(f"OK: wrote Astroport-Juno v1 frontend release bundle to {output_path}")
    print(
        f"bundle_files={len(entries)} manifest={BUNDLE_MANIFEST_NAME} "
        f"required_addresses={len(manifest['required_frontend_addresses'])} optional_addresses={len(manifest['optional_frontend_addresses'])}"
    )


if __name__ == "__main__":
    main()
