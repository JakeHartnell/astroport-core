# 04 — Incentives types-only retention (ADR D1)

**Status:** superseded by P2.5 / ADR D6. This ADR records the earlier rc0/rc1
reason for keeping `packages/astroport/src/incentives.rs` while the incentives
contract was stripped. Juno v1 now ships a stripped `contracts/tokenomics/incentives`
contract; see `11-incentives-and-gauges.md` and `12-incentives-strip-decisions.md`.

## Problem

`contracts/factory/src/contract.rs` imports
`astroport::incentives::ExecuteMsg::DeactivatePool`. The factory constructs
this message when a pair is deactivated and the factory has a
`generator_address: Some(_)` configured.

In rc0/rc1 we shipped `generator_address: None` (no incentives, no DEX token,
see `memory/juno-defi-direction.md`). The code path that constructs the
`DeactivatePool` message was unreachable at that boundary. In P2.5, incentives
returned to v1 scope without adding a DEX token.

But: `packages/astroport/src/incentives.rs` defines the type. If we delete
that module, the factory no longer compiles.

## Options

### (a) Keep `incentives.rs` as types-only *(chosen)*

503 lines of pure `cw_serde` type definitions and constants. No `Deps`,
no `DepsMut`, no storage, no contract logic, no transitive deps beyond
`cosmwasm-std` and `cw20`.

- Invisible from audit perspective (auditor reads "types declaration, no
  state machine to verify").
- Forward-compatible: when v2 ships incentives, no factory edit needed.
- ~6 KB of metadata in the compiled `astroport` package; negligible.

### (b) Refactor factory to drop the import

Two sub-options:

1. Duplicate the `DeactivatePool` type locally in the factory crate. Breaks
   wire compatibility with any downstream tooling that match on the JSON
   shape. Forks the schema.
2. Construct the message as raw JSON `Binary`. Uglier; harder to audit;
   relies on string-formatting being correct rather than the type system.

Both larger diffs than (a) and worse on every axis.

## Decision at rc0/rc1

Option (a). Keep `packages/astroport/src/incentives.rs` exactly as upstream.
Keep `pub mod incentives;` in `src/lib.rs`. The factory's import line at
`contracts/factory/src/contract.rs:19` stays untouched.

## What changed in the rc0/rc1 strip

- The `contracts/tokenomics/incentives` *contract* was deleted at rc0/rc1 (it
  implements the incentives state machine; we did not ship it at that boundary).
- The `astroport::incentives` *types module* in `packages/astroport` stays.

P2.5 supersedes the first bullet: `contracts/tokenomics/incentives` is now a
workspace member again, with Juno-specific strips documented in ADR D6.

The factory imports `astroport::incentives::ExecuteMsg::DeactivatePool` —
the *type*, not the contract binary. Type stays; the stripped incentives
contract now ships separately as a v1 workspace member.

## How to apply this in audit narrative

In `planning/07-audit-scope.md`, the audit-house brief should state:

> The `astroport::incentives` module in `packages/astroport` is retained as
> the canonical wire-type surface for both the factory deactivation hook and
> the shipped `contracts/tokenomics/incentives` contract. In rc0/rc1 the
> module was types-only because the contract was out of scope; P2.5 re-added
> the stripped incentives contract. Audit the type module together with the
> incentives contract and confirm factory `DeactivatePool` messages still
> match the shipped execute schema.

## Current shape after P2.5

Juno v1 ships `astroport-incentives` as a bounded LP rewards contract: DAO-funded
internal rewards, permissionless external incentives, no vesting contract, no
xASTRO staking, no maker, and no new DEX token.
