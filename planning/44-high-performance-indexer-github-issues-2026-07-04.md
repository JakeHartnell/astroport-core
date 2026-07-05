# High-performance indexer GitHub issues

Date: 2026-07-04
Source architecture: [43-high-performance-indexer-architecture-2026-07-04.md](./43-high-performance-indexer-architecture-2026-07-04.md)

Use these as copy-ready GitHub issues. They are ordered so separate agents can work with minimal overlap. Start with Issues 1-4, then fan out to derived workers and read models after the ordered ingestion path is stable.

## Dependency map

```text
1 config + modes
  -> 2 concurrent block fetcher
  -> 3 ordered ingestion pipeline
      -> 4 metrics + structured logs
      -> 5 snapshot job queue + worker
      -> 6 candle job queue + worker
      -> 7 bulk staging + merge
          -> 8 read models
              -> 9 staging benchmark runbook
                  -> 10 optional Rust benchmark
```

---

## Issue 1: Add high-performance indexer runtime config and process modes

Labels: `indexer`, `performance`, `configuration`

Agent profile: TypeScript backend agent familiar with env parsing and tests.

### Context

The current indexer has only a small set of ingestion knobs: `BATCH_SIZE`, `POLL_INTERVAL_MS`, and confirmation settings. The high-performance architecture needs explicit runtime modes and separate controls for fetch concurrency, realtime concurrency, inline enrichment, and worker behavior.

This issue should not change ingestion behavior yet. It should add validated configuration fields and documentation so later issues can consume them safely.

### Scope

- Extend `indexer/src/config.ts` with:
  - `indexerMode: "realtime" | "catchup"`;
  - `rangeSize`;
  - `fetchWindowSize`;
  - `fetchConcurrency`;
  - `realtimeFetchConcurrency`;
  - `rpcTimeoutMs`;
  - `rpcMaxRetries`;
  - `ingestCandlesInline`;
  - `ingestReserveSnapshotsInline`;
  - `ingestAggregatesInline`.
- Add defaults:
  - `INDEXER_MODE=realtime`;
  - `RANGE_SIZE=5000`;
  - `FETCH_WINDOW_SIZE=250`;
  - `FETCH_CONCURRENCY=32`;
  - `REALTIME_FETCH_CONCURRENCY=8`;
  - `RPC_TIMEOUT_MS=10000`;
  - `RPC_MAX_RETRIES=5`;
  - `INGEST_CANDLES_INLINE=true` for backward compatibility;
  - `INGEST_RESERVE_SNAPSHOTS_INLINE=true` for backward compatibility;
  - `INGEST_AGGREGATES_INLINE=false`.
- Validate that numeric values are non-negative and concurrency/window sizes are at least `1`.
- Validate `FETCH_CONCURRENCY <= FETCH_WINDOW_SIZE`.
- Document the new environment variables in `indexer/README.md` and `.env.example`.
- Add tests in `indexer/test/config.test.ts`.

### Out of scope

- No fetch concurrency implementation.
- No worker processes.
- No schema changes.

### Acceptance criteria

- `npm test` passes from `indexer/`.
- `npm run typecheck` passes from `indexer/`.
- Invalid `INDEXER_MODE` throws a clear config error.
- Invalid concurrency/window values throw clear config errors.
- Existing default local dev behavior remains compatible.

---

## Issue 2: Implement bounded concurrent block range fetching

Labels: `indexer`, `performance`, `rpc`

Agent profile: TypeScript backend agent comfortable with concurrency control, retries, and deterministic tests.

### Context

`Indexer.runOnce()` currently processes one height at a time. `JunoRpcClient.block(height)` already fetches `/block` and `/block_results` concurrently for a single height, but the caller still serializes heights. We need a reusable range fetcher that can fetch many block bundles concurrently while returning deterministic height-ordered results.

### Scope

- Create `indexer/src/block-fetcher.ts`.
- Implement a function like:

```ts
export async function fetchBlockRange(params: {
  rpc: JunoRpcClient;
  from: number;
  to: number;
  concurrency: number;
}): Promise<BlockBundle[]>
```

- Cap in-flight block fetches with the configured concurrency.
- Return block bundles sorted by ascending height.
- Fail the whole range if any height exhausts retries.
- Add retry support to `JunoRpcClient.get` using `rpcTimeoutMs` and `rpcMaxRetries` from config.
- Treat `408`, `425`, `429`, and `5xx` as transient.
- Add tests that prove:
  - concurrency is greater than one;
  - results are sorted even when requests resolve out of order;
  - transient errors are retried;
  - permanent errors fail clearly.

### Out of scope

- Do not change cursor advancement yet.
- Do not add staging tables.
- Do not add WebSocket behavior.

### Acceptance criteria

- `indexer/test/rpc.test.ts` or a new `indexer/test/block-fetcher.test.ts` covers success, sorting, concurrency cap, and retry behavior.
- Existing `JunoRpcClient.block(height)` behavior remains compatible.
- `npm test` and `npm run typecheck` pass from `indexer/`.

---

## Issue 3: Refactor the indexer into fetch, decode, and ordered writer stages

Labels: `indexer`, `performance`, `ingestion`

Agent profile: Senior TypeScript backend agent. This issue touches the core ingestion path and should be assigned to one agent at a time.

### Context

Concurrent fetching only helps if the indexer can fetch ahead while preserving ordered commits. The cursor must advance only after all facts for `cursor + 1` have committed. This issue refactors `Indexer.runOnce()` into clear pipeline stages while keeping one transaction per block for correctness.

### Scope

- Split the current `runOnce()` logic into internal stages:
  - range planning;
  - block range fetch using Issue 2;
  - event normalization;
  - ordered block write;
  - optional inline enrichment.
- Use `fetchConcurrency` in catch-up mode and `realtimeFetchConcurrency` in realtime mode.
- Preserve strict ascending commit order even if fetched blocks arrive out of order.
- Keep `recordProcessedBlock`, `writeNormalizedEvents`, and `advanceCursor` in one DB transaction per block.
- Respect `INGEST_RESERVE_SNAPSHOTS_INLINE`.
  - If true, keep current snapshot behavior.
  - If false, skip inline snapshots for now. Issue 5 will enqueue jobs.
- Respect `INGEST_CANDLES_INLINE` by passing a write option into DB event writing or by adding a narrowly scoped DB writer option.
- Add tests proving:
  - multiple blocks are fetched before ordered writing;
  - cursor advances height by height;
  - a failed block write stops later cursor advancement;
  - disabling inline reserve snapshots avoids LCD calls.

### Out of scope

- No staging tables or COPY.
- No snapshot job worker.
- No candle worker.
- No external queue.

### Acceptance criteria

- A bounded backfill can process more than one block per `runOnce()` while fetching with concurrency.
- Cursor advancement remains deterministic and idempotent.
- Existing reserve snapshot tests still pass, with additional coverage for disabled inline snapshots.
- `npm test` and `npm run typecheck` pass from `indexer/`.

---

## Issue 4: Add ingestion throughput metrics and structured logs

Labels: `indexer`, `observability`, `performance`

Agent profile: Backend/observability agent.

### Context

We cannot tune the pipeline without measuring source throughput, writer throughput, lag, retries, and queue depth. The API already exposes Prometheus-style metrics for readiness and lag. Extend that surface with ingestion performance metrics.

### Scope

- Add an in-process metrics collector for the indexer process.
- Expose new metrics from `/metrics`:
  - `juno_indexer_fetch_blocks_total`;
  - `juno_indexer_fetch_blocks_per_second`;
  - `juno_indexer_fetch_rpc_requests_in_flight`;
  - `juno_indexer_fetch_rpc_error_total{status}`;
  - `juno_indexer_decode_blocks_total`;
  - `juno_indexer_writer_blocks_total`;
  - `juno_indexer_writer_commit_seconds`;
  - `juno_indexer_writer_events_total{kind}`;
  - `juno_indexer_reorg_halt`.
- Add structured logs for each processed range:

```json
{
  "role": "indexer",
  "rangeFrom": 39381297,
  "rangeTo": 39381355,
  "cursor": 39381355,
  "head": 39390000,
  "target": 39389998,
  "lag": 8643,
  "blocks": 59,
  "swaps": 2,
  "liquidityEvents": 1,
  "incentiveEvents": 0,
  "durationMs": 1200,
  "dbDurationMs": 300
}
```

- Add tests for metric text output.

### Out of scope

- No external Prometheus integration.
- No dashboard provisioning.

### Acceptance criteria

- `/metrics` remains valid Prometheus text exposition.
- Existing readiness/health metrics remain unchanged.
- Logs contain enough fields to calculate blocks/sec from platform logs.
- `npm test` and `npm run typecheck` pass from `indexer/`.

---

## Issue 5: Defer reserve snapshots into a Postgres-backed job queue

Labels: `indexer`, `performance`, `database`, `worker`

Agent profile: TypeScript backend agent comfortable with Postgres queues and idempotent workers.

### Context

Height-pinned LCD smart queries are expensive and currently block ingestion after each touched block. During historical catch-up, block facts should advance without waiting for reserve snapshots. This issue adds a replayable snapshot job queue and worker.

### Scope

- Add a migration for `snapshot_jobs`:
  - `id`;
  - `chain_id`;
  - `pair_address`;
  - `height`;
  - `block_time`;
  - `reason`;
  - `status`;
  - `attempts`;
  - `leased_until`;
  - `last_error`;
  - timestamps.
- Add uniqueness on `(chain_id, pair_address, height, reason)`.
- When `INGEST_RESERVE_SNAPSHOTS_INLINE=false`, enqueue snapshot jobs for touched known pairs instead of querying LCD inline.
- Add `indexer/src/snapshot-worker.ts`.
- Worker behavior:
  - claims jobs with `FOR UPDATE SKIP LOCKED`;
  - queries LCD with `x-cosmos-block-height`;
  - writes `pool_state_snapshots`;
  - retries transient failures;
  - marks permanent failures after max attempts.
- Add an npm script:

```json
"worker:snapshots": "tsx src/snapshot-worker.ts"
```

- Add tests for enqueue idempotency, successful job processing, retry, and permanent failure.

### Out of scope

- No candle or aggregate jobs.
- No external queue.
- No UI/API changes.

### Acceptance criteria

- Disabling inline reserve snapshots no longer blocks cursor advancement.
- Snapshot jobs are idempotent and can be safely retried.
- Worker only writes snapshots for known pools.
- `npm test` and `npm run typecheck` pass from `indexer/`.

---

## Issue 6: Move candle generation out of swap ingestion

Labels: `indexer`, `performance`, `candles`, `worker`

Agent profile: TypeScript backend agent with SQL aggregation experience.

### Context

Swap insertion currently updates candle rows inline for every swap and interval. That creates write amplification in the block ingestion transaction. Historical catch-up should persist swaps first, then build candles in range jobs.

### Scope

- Add config support from Issue 1 into DB writing so `INGEST_CANDLES_INLINE=false` skips inline candle writes.
- Add a `candle_jobs` table or make the existing candle backfill command continuously claimable by pair/range.
- Add a worker command:

```json
"worker:candles": "tsx src/candle-worker.ts"
```

- Worker behavior:
  - reads committed swaps by pair/range;
  - computes `5m`, `1h`, and `1d` buckets;
  - upserts `token_candles` idempotently;
  - records job status and failures.
- Ensure open/close ordering is deterministic by height and event ordering.
- Keep the existing `backfill:candles` CLI working.
- Add tests that prove:
  - inline candle writes can be disabled;
  - worker rebuild produces the same candle shape as existing helpers;
  - rerunning the worker is idempotent.

### Out of scope

- No Timescale continuous aggregates.
- No API response changes unless needed to preserve current behavior.

### Acceptance criteria

- Block ingestion can persist swaps without writing `token_candles`.
- Candle worker can rebuild candles from persisted swaps.
- Existing candle tests pass.
- `npm test` and `npm run typecheck` pass from `indexer/`.

---

## Issue 7: Add bulk staging tables and merge path for catch-up ingestion

Labels: `indexer`, `performance`, `database`

Agent profile: Senior backend/database agent. This is the highest-risk performance issue and should start only after Issue 3 is stable.

### Context

Even with concurrent fetch, per-event inserts and per-block transactions will become the next bottleneck. PostgreSQL recommends `COPY` for large row loads. This issue adds a catch-up-only staging and merge path while preserving canonical table constraints.

### Scope

- Add staging tables:
  - `stage_processed_blocks`;
  - `stage_pools`;
  - `stage_swaps`;
  - `stage_liquidity_events`;
  - `stage_incentive_events`.
- Add `batch_id`, `chain_id`, `height`, and timestamps to every staging row.
- Implement a catch-up batch writer:
  - converts decoded events into staging rows;
  - uses `COPY` or efficient multi-row insert for staging load;
  - merges staging rows into canonical tables with `ON CONFLICT` behavior matching current writers;
  - advances cursor only after merge succeeds.
- Keep the existing per-block ordered writer as the default until the bulk path has tests.
- Add cleanup for old successful staging batches.
- Add tests comparing canonical rows produced by:
  - current per-block writer;
  - new staging merge writer.

### Out of scope

- No dropping production indexes.
- No external object storage.
- No schema partitioning in this issue unless strictly required.

### Acceptance criteria

- Catch-up mode can use the staging merge path behind a config flag.
- Replaying the same batch does not duplicate canonical rows.
- Batch failure leaves cursor unchanged.
- Per-block writer remains available and tested.
- `npm test` and `npm run typecheck` pass from `indexer/`.

---

## Issue 8: Build API read models for pools, stats, candles, wallet history, and positions

Labels: `indexer`, `api`, `database`, `performance`

Agent profile: Backend/API agent with SQL view/materialized view experience.

### Context

The API should not scan raw event tables under load. After ingestion is faster, API latency must come from narrow precomputed read models. This issue creates those read models and moves `PostgresApiStore` to use them where appropriate.

### Scope

- Add migrations for read model tables or materialized views:
  - `latest_pool_state`;
  - `pool_volume_windows`;
  - `pool_candle_buckets` or equivalent candle API index/view;
  - `wallet_history_flat`;
  - `wallet_position_latest`;
  - `protocol_stats_latest`.
- Add refresh SQL or worker functions for each read model.
- Update `indexer/src/api-store.ts` to prefer read models.
- Preserve frontend-compatible response shapes.
- Ensure empty production data returns honest empty arrays/nulls.
- Add tests for:
  - `/stats`;
  - `/pools`;
  - `/pools/:id`;
  - `/pools/:id/candles`;
  - `/wallets/:addr/history`;
  - `/wallets/:addr/positions`.

### Out of scope

- No USD price provider integration unless existing persisted prices are enough.
- No Timescale dependency unless already available in deployment.

### Acceptance criteria

- API tests prove read-model-backed responses match existing contract.
- Raw event tables are not queried for high-traffic list/stat endpoints except as fallback in tests or dev.
- `npm test` and `npm run typecheck` pass from `indexer/`.

---

## Issue 9: Create staging benchmark runbook and performance acceptance test

Labels: `indexer`, `performance`, `deployment`, `documentation`

Agent profile: DevOps/backend agent who can write runbooks and scripts.

### Context

The high-performance indexer needs measured results, not theoretical throughput. This issue adds a repeatable benchmark procedure for staging and a small scripted harness that records blocks/sec, RPC failures, DB pressure, and cursor lag.

### Scope

- Add a runbook under `deployment/`, for example:
  - `deployment/indexer-performance-benchmark-runbook.md`.
- Include required environment:
  - paid or self-hosted archive RPC/LCD;
  - staging Postgres;
  - `INDEXER_MODE=catchup`;
  - inline snapshots/candles disabled.
- Add benchmark commands for:
  - 10,000-block low-event range;
  - known event-heavy range;
  - realtime catch-up after benchmark.
- Add SQL snippets for:
  - cursor height;
  - processed block count;
  - swaps/liquidity count;
  - staging table cleanup;
  - job backlog depth.
- Add a lightweight script if useful, for example `indexer/src/benchmark-range.ts`, that runs a bounded range and prints machine-readable JSON summary.
- Document expected first milestone:
  - `FETCH_CONCURRENCY > 1`;
  - strict ordered cursor advancement;
  - snapshot and candle workers not blocking ingestion;
  - measured blocks/sec and error rates captured.

### Out of scope

- No platform-specific deployment automation.
- No production cutover.

### Acceptance criteria

- A new operator can run the benchmark from the runbook without reading architecture notes.
- The benchmark output includes block range, duration, blocks/sec, cursor, head, target, lag, RPC error count, and event counts.
- Documentation clearly states how to interpret provider throttling versus DB saturation.

---

## Issue 10: Benchmark whether Rust is needed for the ingestion hot path

Labels: `indexer`, `performance`, `research`, `rust`

Agent profile: Performance-focused agent comfortable with TypeScript and Rust benchmarking.

### Context

The architecture keeps TypeScript first because the current repo and API are TypeScript. Rust should only be introduced if profiling proves Node is the bottleneck after concurrent fetch, deferred enrichment, and bulk staging are implemented.

### Scope

- Build a benchmark plan comparing:
  - TypeScript fetch/decode/write throughput;
  - source endpoint max throughput;
  - Postgres staging merge throughput;
  - CPU and memory profile under high concurrency.
- Optionally prototype a minimal Rust decoder/writer against fixture block bundles.
- Use existing real Juno fixture data where possible.
- Produce a markdown decision record under `planning/`.
- Recommendation must be one of:
  - stay TypeScript for now;
  - move only fetch/decode to Rust;
  - move fetch/decode/ordered-writer to Rust;
  - revisit after database/source bottlenecks are removed.

### Out of scope

- No production Rust rewrite.
- No replacing the TypeScript API.
- No schema changes.

### Acceptance criteria

- Decision record includes measured throughput and bottleneck analysis.
- Recommendation explains operational cost versus speedup.
- Any prototype is isolated and does not affect production builds unless explicitly approved later.

---

## Suggested first sprint

Assign these in parallel:

- Agent A: Issue 1.
- Agent B: Issue 2 after Issue 1 config shape is reviewed, or with a small local config shim.
- Agent C: Issue 4, mostly independent.
- Agent D: Issue 5 schema/worker design can start after agreeing on job table names, but integration waits for Issue 3.

Keep Issue 3 with one owner. It is the core ingestion refactor and should not be split until the fetcher and config work are merged.
