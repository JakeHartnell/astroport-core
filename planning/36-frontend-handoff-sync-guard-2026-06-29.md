# 36 — Frontend handoff sync guard (2026-06-29)

## Decision

Add a dependency-free guard that keeps the frontend address handoff synchronized across the deployment template, generated TypeScript declarations, consumer example, and deployment README.

## Why

The frontend launch surface is now spread across four files:

- `deployment/juno-v1-testnet.template.json` — source of truth for `frontend.required_addresses` and `frontend.optional_addresses`.
- `deployment/juno-v1-frontend-config.d.ts` — generated TypeScript union consumed by frontend repos.
- `deployment/juno-v1-frontend-config.example.ts` — minimal consumer fixture and helper map.
- `deployment/README.md` — operator/frontend prose handoff.

If any one of these drifts, a frontend can ship against the wrong contract map even when the contract artifacts are correct. This is launch risk, not scope expansion.

## Guard

`scripts/check_juno_v1_frontend_handoff_sync.py` verifies:

- the deployment template frontend address keys exist in the top-level `addresses` map;
- required and optional generated TypeScript unions match the template exactly;
- the TypeScript example `required_addresses`, `optional_addresses`, and `frontendAddressMap` match the template exactly;
- the README contains the synchronized required/optional frontend address lines.

The guard is wired into `.github/workflows/tests_and_checks.yml` before Rust setup and is itself enforced by `scripts/check_juno_v1_ci_wiring.py`.

## Verification

Run from repo root:

```sh
python3 scripts/check_juno_v1_frontend_handoff_sync.py
python3 scripts/check_juno_v1_ci_wiring.py
```

Expected output includes:

```text
OK: Juno v1 frontend handoff address keys are synchronized
required=4 optional=1 map_keys=5 source=deployment-template
```

## Scope

Still v1 only: XYK pair creation, native incentives, no new DEX token, no stable/PCL/LST/perp/yield surface.
