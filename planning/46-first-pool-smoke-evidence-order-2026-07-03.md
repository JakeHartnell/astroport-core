# First-pool smoke evidence tx-height ordering

Date: 2026-07-03

## Decision

The offline first-pool smoke evidence validator now requires the four saved
broadcast tx JSON files to include positive heights that are nondecreasing in
the intended launch order:

1. `first-pool-smoke-create-pair.json`
2. `first-pool-smoke-provide-liquidity.json`
3. `first-pool-smoke-tiny-swap.json`
4. `first-pool-smoke-router-tiny-swap.json`

This is intentionally still offline. It does not query uni-7; it only rejects a
locally assembled evidence bundle that is internally inconsistent before the
operator opens public XYK pair creation.

## Why this reduces launch risk

The previous validator proved the files were present, successful, distinct, and
showed pool-state movement after swaps. It did not catch a bundle assembled from
stale or reordered tx responses. Height monotonicity is a cheap sanity check
that the operator evidence follows the required flow: create the official first
pool, seed it, then test both direct pair and router swap paths.

## Scope guard

This does not add new v1 product scope. It only hardens the permissioned
first-pool launch gate for the existing XYK swap/liquidity path.

## Verification

Run:

```sh
python3 scripts/check_juno_v1_first_pool_smoke_evidence.py
```

Expected output includes:

```text
first_pool_smoke_evidence_validator=true tx_files=4 query_files=5 failure_cases=7 txhash_uniqueness=true tx_height_order=true post_swap_pool_delta=true
```
