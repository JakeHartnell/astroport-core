# 37 — Frontend release checklist guard (2026-06-29)

## Decision

Add a final frontend release checklist plus a dependency-free guard for the moment real uni-7 deployment values move into the UI repo.

## Why

The handoff now has solid machine checks for templates, tx extraction, rendered configs, generated TypeScript, examples, and README prose. The remaining launch-risk seam is operational: copying the right files into the UI repo after real code IDs and contract addresses exist.

A short checklist makes that seam explicit without expanding v1 scope.

## Files

- `deployment/frontend-release-checklist.md` — names the release files, pre-copy verification commands, synchronized frontend address surface, and v1 scope guardrails.
- `scripts/check_juno_v1_frontend_release_checklist.py` — validates the checklist against the deployment template and handoff files.

The guard is wired into `.github/workflows/tests_and_checks.yml` before Rust setup and is enforced by `scripts/check_juno_v1_ci_wiring.py`.

## Verification

Run from repo root:

```sh
python3 scripts/check_juno_v1_frontend_release_checklist.py
python3 scripts/check_juno_v1_ci_wiring.py
```

Expected output includes:

```text
OK: Juno v1 frontend release checklist matches the deployment handoff
release_files=3 commands=5 required=4 optional=1 pair_discovery=factory
```

## Scope

Still v1 only: copy rendered config + generated handoff type, use XYK pair-create template only as a form seed, discover pools through the factory, no new DEX token, no stable/PCL/LST/perp/yield surface.
