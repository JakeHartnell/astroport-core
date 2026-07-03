# Juno DEX indexer staging backfill + fixture validation

Date: 2026-07-03
Branch: `indexer-real-fixtures-staging-readiness-2026-07-03`
Depends on: PR #99 / merge commit `752716c4fee0c56f5f58c1c27dcbd0ffab495a15`

## Goal

Move the indexer from API-foundation-ready to staging-backfill-ready by proving event parsing against real Juno v1 transactions, documenting the staging runbook, and tightening the first backfill gate.

## Done criteria

- Real public Juno v1 transaction fixtures cover:
  - factory create pair;
  - seed liquidity;
  - smoke swap;
  - smoke add liquidity;
  - smoke withdraw liquidity.
- `services/indexer` tests assert normalized event outputs from those fixtures.
- Parser handles real Astroport/Juno event formats without synthetic assumptions:
  - `register` factory event as the concrete pair-created source;
  - comma-separated coin lists like `10000ujuno, 9803factory/...`;
  - `refund_assets` and `withdrawn_share` on withdraw events.
- Staging runbook explains exact migration/backfill/API smoke flow and blockers.
- Verification passes locally and in CI before merge.

## Non-goals for this slice

- Do not deploy staging infra from this PR.
- Do not wire production `VITE_DEX_INDEXER_URL`.
- Do not implement reserve snapshots, pricing providers, WebSocket tailing, or rollback.
- Do not commit raw private operator archives or wasm artifacts. Fixtures are slim public tx evidence only.

## Follow-up after this slice

1. Add reserve snapshot worker and latest state population.
2. Add Postgres-backed aggregate rebuild commands.
3. Run the staging Postgres backfill from `START_HEIGHT=39381297`.
4. Smoke `/health`, `/ready`, `/stats`, `/pools`, `/pools/:id/candles`, `/wallets/:addr/history` against staging data.
5. Only then consider wiring frontend previews to the staging API.
