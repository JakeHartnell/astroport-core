#!/usr/bin/env python3
"""Reject tracked secret-like material in text files.

The scan intentionally reports only path, line, and rule name. It never echoes the
matched secret-like value back to logs.
"""
from __future__ import annotations

import pathlib
import re
import subprocess
import sys
from typing import NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]

RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("explicit mnemonic variable", re.compile(r"(?i)\b(USER_)?MNEMONIC\b\s*[:=]")),
    (
        "private key variable",
        re.compile(
            r"(?i)(?:^|[\s{,\[])[\"']?(private[_ -]?key|secret[_ -]?key)[\"']?\s*[:=]"
        ),
    ),
    (
        "seed phrase text",
        re.compile(r"(?i)\b(seed phrase|mnemonic phrase|wallet mnemonic)\b"),
    ),
)
REDACTED_SECRET_VALUE = re.compile(
    r"(?i)(?:^|[\s{,\[])[\"']?(?:private[_ -]?key|secret[_ -]?key)[\"']?\s*[:=]\s*[\"']?<redacted>[\"']?"
)
ALLOWLIST = {
    "scripts/check_juno_v1_secret_scan.py",
}


SELF_TEST_CASES: tuple[tuple[str, str], ...] = (
    ("private key variable", '"private_key": "fixture-not-redacted"'),
    ("private key variable", "private-key = 'fixture-not-redacted'"),
    ("private key variable", "secret key: fixture-not-redacted"),
)
SELF_TEST_NEGATIVE_CASES = (
    '"public_key": "<redacted-fixture>"',
    '"private_key": "<REDACTED>"',
)


def fail(message: str) -> NoReturn:
    print(f"FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def git_ls_files() -> list[str]:
    proc = subprocess.run(
        ["git", "ls-files"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        fail(f"git ls-files failed: {proc.stderr.strip()}")
    return [line for line in proc.stdout.splitlines() if line]


def read_text(path: pathlib.Path) -> str | None:
    data = path.read_bytes()
    if b"\0" in data:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return None


def matching_rule(line: str) -> str | None:
    if REDACTED_SECRET_VALUE.search(line):
        return None
    for rule_name, pattern in RULES:
        if pattern.search(line):
            return rule_name
    return None


def run_self_tests() -> None:
    rules_by_name = {name: pattern for name, pattern in RULES}
    for rule_name, fixture_line in SELF_TEST_CASES:
        pattern = rules_by_name.get(rule_name)
        if pattern is None:
            fail(f"missing self-test rule: {rule_name}")
        if not pattern.search(fixture_line):
            fail(f"secret scan self-test failed: {rule_name}")

    for fixture_line in SELF_TEST_NEGATIVE_CASES:
        if matching_rule(fixture_line) is not None:
            fail("secret scan self-test failed: benign key matched")


def main() -> None:
    run_self_tests()
    findings: list[str] = []
    for rel in git_ls_files():
        if rel in ALLOWLIST:
            continue
        text = read_text(ROOT / rel)
        if text is None:
            continue
        for line_no, line in enumerate(text.splitlines(), start=1):
            rule_name = matching_rule(line)
            if rule_name is not None:
                findings.append(f"{rel}:{line_no}: {rule_name}")

    if findings:
        for finding in findings[:20]:
            print(f"FAIL: secret-like tracked text: {finding}", file=sys.stderr)
        if len(findings) > 20:
            print(f"FAIL: ... {len(findings) - 20} additional finding(s) omitted", file=sys.stderr)
        sys.exit(1)

    print("OK: tracked text passed Juno v1 secret scan")
    print(f"files_scanned={len(git_ls_files())} rules={len(RULES)} findings=0")


if __name__ == "__main__":
    main()
