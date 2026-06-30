# 13 — Juno v1 scope guard verification

Date: 2026-06-28

## Slice

Verified the local Astroport-Juno v1 scope guard after P2.5 re-added bounded LP incentives to v1.

## Why it matters

The launch scope must stay simple: XYK swaps, pools, liquidity, and bounded LP incentives only. The docs now say `contracts/tokenomics/incentives` is included, so `Cargo.toml`, the canonical strip list, and the final wasm artifact set need to agree.

## Commands run

```sh
python3 scripts/check_juno_v1_scope.py
git diff --check -- planning/01-strip-list.md planning/04-incentives-types-decision.md scripts/check_juno_v1_scope.py
git status --short --branch
```

## Results

```text
OK: Astroport-Juno v1 scope matches Cargo.toml and planning/01-strip-list.md
workspace_members=13 expected_wasms=8
```

`git diff --check` produced no output, so the changed planning files and new guard script have no whitespace errors.

## Current local refs

```text
## main...origin/main
 M planning/01-strip-list.md
 M planning/04-incentives-types-decision.md
?? scripts/check_juno_v1_scope.py
?? planning/13-scope-guard-verification-2026-06-28.md
```

## Next

Run the broader contract build/check path for the eight expected wasm artifacts, then wire `scripts/check_juno_v1_scope.py` into CI or a documented pre-audit checklist.
