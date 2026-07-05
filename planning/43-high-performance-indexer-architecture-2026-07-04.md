# High-performance Juno DEX indexer architecture

Date: 2026-07-04
Scope: replace the current serial block poller with a catch-up and realtime architecture that can index Juno v1 history as fast as the data source and Postgres allow.

## Executive decision

Build a two-mode indexer around a shared Postgres fact store:

1. **Catch-up mode:** range-based, highly concurrent block acquisition; ordered block commit; bulk writes into staging tables; enrichment jobs deferred.
2. **Realtime mode:** WebSocket-triggered head tracking; confirmed-height polling; small ordered batches; enrichment workers run near-live but outside the cursor-critical path.

The ingestion hot path must do only four things: fetch block data, normalize relevant events, persist raw facts idempotently, and advance the cursor in height order. Reserve snapshots, candles, TVL, prices, wallet aggregates, and API materialization should be independent workers that can lag, retry, and rebuild without blocking block ingestion.

## Research notes

- CometBFT exposes blockchain data over URI/HTTP, JSON-RPC over HTTP, and JSON-RPC over WebSockets. WebSockets support subscriptions such as `NewBlock`, but should be treated as a wakeup signal, not the source of truth for committed historical data. Source: [CometBFT RPC docs](https://docs.cosmos.network/cometbft/latest/api-reference/rpc).
- CometBFT/Tendermint event search depends on transaction and block event indexing. Defaults always include `tx.height` and `tx.hash`; richer event queries depend on node indexer configuration. Source: [Tendermint indexing transactions](https://docs.tendermint.com/v0.34/app-dev/indexing-transactions.html) and [production notes](https://docs.tendermint.com/v0.34/tendermint-core/running-in-production.html).
- Cosmos SDK exposes `GetTxsEvent` and `GetBlockWithTxs` through the tx service, including REST mappings. These are useful secondary data paths, but the current event normalizer already depends on tx result events from block results. Source: [cosmos.tx.v1beta1 service proto](https://github.com/cosmos/cosmos-sdk/blob/main/proto/cosmos/tx/v1beta1/service.proto).
- PostgreSQL bulk loading guidance is clear: `COPY` is optimized for large row loads and has less overhead than repeated `INSERT`; loading then creating indexes is fastest for fresh tables. Source: [PostgreSQL populate database docs](https://www.postgresql.org/docs/current/populate.html).
- Timescale continuous aggregates can maintain hourly/daily summaries and support manual refresh windows, but open-ended refreshes and still-hot buckets can create write amplification. Source: [Timescale continuous aggregates docs](https://github.com/timescale/docs.timescale.com-content/blob/master/using-timescaledb/continuous-aggregates.md).

## Current bottlenecks

The current implementation is correct but deliberately simple:

- `Indexer.runOnce()` fetches and writes one height at a time.
- `JunoRpcClient.block()` performs two RPC requests per height: `/block` and `/block_results`.
- The DB writer loops event-by-event and swap candle writes happen inline.
- LCD reserve snapshots run after each block and are serialized by touched pair.
- `BATCH_SIZE` increases the number of heights per loop, but not concurrency.

This means catch-up speed is roughly:

```text
blocks_per_second ~= 1 / (block_rpc_latency + block_db_latency + reserve_snapshot_latency)
```

The target architecture should move to:

```text
blocks_per_second ~= min(source_fetch_capacity, decode_capacity, ordered_commit_capacity)
```

## Performance target

Initial target for staging:

| Mode | Target |
|---|---:|
| Historical catch-up with paid archive RPC/LCD | 50-200 blocks/sec for empty/low-event ranges |
| Historical catch-up with self-hosted co-located archive RPC | 200+ blocks/sec where DB keeps up |
| Event-heavy ranges | bounded by DB upsert and candle/snapshot deferral |
| Realtime confirmed lag | under 10 confirmed blocks after catch-up |
| API p95 for pool/stats reads | under 250 ms from materialized read models |

These are engineering targets, not guarantees. The actual ceiling will be the archive endpoint, network latency, and Postgres write IOPS.

## Source strategy

### Preferred production source

Run or rent a dedicated Juno archive RPC/LCD close to the indexer and database.

Requirements:

- archive access back to `START_HEIGHT=39381297`;
- `/block`, `/block_results`, `/status`, and `/health`;
- WebSocket endpoint for `NewBlock`;
- height-pinned LCD smart queries for pair state snapshots;
- explicit rate limits and burst capacity;
- event indexing enabled if we choose `tx_search` or `GetTxsEvent` for targeted repair jobs.

### Fastest source option

Self-host a non-validator archive node in the same region/VPC as the indexer. This removes provider rate limits and Internet latency from catch-up. It also lets us tune RPC limits, connection limits, pruning/archive behavior, and tx indexing intentionally. This is the highest-ops option but the best throughput ceiling.

### Fallback source

Use a paid archive provider with independent RPC and LCD endpoints. Public free endpoints are acceptable for smoke tests only; they are not a viable catch-up substrate.

## Service topology

Use one Docker image, multiple process roles:

| Role | Responsibility | Scales |
|---|---|---:|
| `coordinator` | owns range leases, cursors, reorg state, worker health | 1 active |
| `block-fetcher` | fetches `/block` and `/block_results` for leased ranges | horizontally |
| `decoder` | normalizes wasm events and emits compact fact batches | horizontally |
| `ordered-writer` | commits facts in contiguous height order and advances cursor | 1 per cursor |
| `snapshot-worker` | height-pinned LCD pair reserve snapshots | horizontally, rate-limited |
| `candle-worker` | rebuilds/updates OHLC buckets from swaps | horizontally by pair/range |
| `aggregate-worker` | refreshes materialized views or rollup tables | horizontally by job type |
| `api` | serves frontend-compatible HTTP API | horizontally |

For first implementation, these can be Node processes sharing Postgres as the coordination layer. If profiling shows Node JSON parsing or event decoding is CPU-bound, rewrite `block-fetcher`/`decoder`/`ordered-writer` in Rust while keeping the API in TypeScript.

## Data flow

```text
confirmed target
  -> range leases
  -> concurrent block fetch
  -> decode/normalize
  -> reorder buffer by height
  -> bulk stage facts
  -> ordered merge into canonical tables
  -> advance block cursor
  -> enqueue snapshot/candle/aggregate repair jobs
  -> API read models
```

Critical rule: only the ordered writer advances `indexer_cursors`. Everything else is replayable derived state.

## Catch-up mode

### Range leasing

Add `indexer_range_leases`:

```sql
create table indexer_range_leases (
  cursor_id text not null,
  from_height bigint not null,
  to_height bigint not null,
  status text not null check (status in ('leased', 'fetched', 'decoded', 'committed', 'failed')),
  worker_id text,
  attempts integer not null default 0,
  leased_until timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (cursor_id, from_height, to_height)
);
```

The coordinator leases contiguous chunks, for example 1,000-10,000 heights. Fetchers split leases into smaller request windows, for example 100-500 heights.

### Concurrent fetch

Within a fetch window:

- fetch `/block` and `/block_results` concurrently per height;
- cap in-flight HTTP requests with `FETCH_CONCURRENCY`;
- use separate caps for RPC and LCD;
- retry transient 408/429/5xx with exponential backoff and jitter;
- keep response payloads compressed if provider supports it;
- write raw block bundles to a durable staging table or object storage for replay.

Recommended first knobs:

```text
RANGE_SIZE=5000
FETCH_WINDOW_SIZE=250
FETCH_CONCURRENCY=32
RPC_TIMEOUT_MS=10000
RPC_MAX_RETRIES=5
```

Tune up only after measuring provider throttling and DB write saturation.

### Ordered commit

Fetch and decode can run ahead out of order. Commit must be contiguous:

1. writer reads decoded batches where `height = cursor + 1`;
2. validates parent hash against `processed_blocks`;
3. writes block ledger and fact rows;
4. commits;
5. advances cursor;
6. repeats until a gap appears.

This keeps restart and reorg behavior simple.

### Bulk write model

For catch-up, write to staging tables first:

```text
stage_processed_blocks
stage_pools
stage_swaps
stage_liquidity_events
stage_incentive_events
stage_snapshot_jobs
stage_candle_jobs
```

Use `COPY` for large batches where possible, then merge:

```sql
insert into swaps (...)
select ...
from stage_swaps
where batch_id = $1
on conflict do nothing;
```

For smaller realtime batches, multi-row `INSERT ... ON CONFLICT` is enough. Avoid per-row insert loops in the hot path.

### Fast catch-up switches

Catch-up should support:

```text
INGEST_CANDLES_INLINE=false
INGEST_RESERVE_SNAPSHOTS_INLINE=false
INGEST_AGGREGATES_INLINE=false
```

Default these to false for historical backfill. Derived workers repair after the raw facts are complete.

## Realtime mode

Realtime should subscribe to `NewBlock` over WebSocket to wake the coordinator, then process up to:

```text
confirmed_target = head_height - CONFIRMATION_DEPTH
```

The actual data should still be fetched through the same block bundle path as catch-up. That avoids a separate correctness model for live blocks.

Suggested realtime knobs:

```text
CONFIRMATION_DEPTH=2
REALTIME_FETCH_CONCURRENCY=8
REALTIME_BATCH_SIZE=50
POLL_INTERVAL_MS=1000
```

If WebSocket disconnects, polling `/status` continues. WebSocket is an optimization, not a dependency.

## Reorg handling

Keep current conservative behavior first: halt on block hash or parent hash mismatch.

Then implement bounded rollback:

1. detect mismatch at height `h`;
2. find common ancestor down to `h - REORG_WINDOW`;
3. delete derived and fact rows for affected heights using partition-friendly predicates;
4. reset cursor to ancestor;
5. replay.

Do not let snapshot/candle workers operate on heights above the committed cursor.

Recommended settings:

```text
CONFIRMATION_DEPTH=2 for normal realtime
REORG_WINDOW=100 for automatic rollback
MANUAL_INTERVENTION_REQUIRED beyond REORG_WINDOW
```

## Database architecture

### Canonical facts

Canonical append-mostly facts:

- `processed_blocks(chain_id, height, block_hash, parent_hash, block_time, tx_count)`
- `pools`
- `swaps`
- `liquidity_events`
- `incentive_events`
- `pool_state_snapshots`
- `token_prices`

### Partitioning

Partition high-volume fact tables by height or block time:

- `processed_blocks`: range by height;
- `swaps`, `liquidity_events`, `incentive_events`: range by block time or height;
- `token_candles`: range by bucket start;
- `pool_state_snapshots`: range by block time or height.

Native Postgres partitioning is enough initially. Use Timescale hypertables if operationally available and we want continuous aggregates plus compression.

### Indexing

Keep ingestion indexes minimal:

- uniqueness constraints needed for idempotency;
- lookup indexes used by writer hot path: `(chain_id, pair_address)` for pools;
- API indexes on read models, not necessarily raw facts.

For a fresh historical rebuild, fastest path is:

1. load facts into staging;
2. merge canonical rows;
3. build or rebuild nonessential indexes;
4. refresh read models.

Do not drop production API indexes while the public API is serving traffic. Use a shadow database or maintenance window for full rebuilds.

### Read models

API should read from narrow, precomputed tables/views:

- `latest_pool_state`;
- `pool_volume_windows`;
- `pool_candle_buckets`;
- `wallet_position_latest`;
- `wallet_history_flat`;
- `protocol_stats_latest`;

For Timescale deployments, use continuous aggregates for stable hourly/daily rollups, excluding the hottest bucket where write amplification hurts. Without Timescale, maintain rollup tables with idempotent jobs keyed by `(pair_address, interval, bucket_start)`.

## Derived workers

### Reserve snapshots

Snapshot jobs should be enqueued when swaps/provides/withdraws touch known pairs:

```text
snapshot_jobs(pair_address, height, block_time, reason, status, attempts)
```

Workers:

- query LCD with `x-cosmos-block-height`;
- dedupe by `(pool_id, height, source)`;
- retry transient errors;
- mark permanent failures without blocking the cursor;
- support pair/range repair jobs.

Snapshot concurrency must be lower than block fetch concurrency because LCD smart queries are heavier and more rate-limited.

### Candles

Candles should be built from persisted swaps, not inline with ingestion:

- realtime worker processes recent committed swaps every few seconds;
- catch-up worker rebuilds candles pair/range in large batches;
- writes are idempotent by `(chain_id, pair_address, asset, quote_asset, interval, bucket_start)`;
- open/close ordering must use `(height, tx_index, msg_index, event_index)` where available.

### Wallet positions

Wallet positions are derived from:

- liquidity events;
- LP token balances if queried;
- incentives bond/unbond/claim events;
- optional periodic balance snapshots.

Keep raw event facts separate from position read models so bugs in position accounting can be repaired without replaying the chain source.

## Queue choice

Start with Postgres-backed queues because the repo already depends on Postgres and the operational surface stays small.

Use tables with `FOR UPDATE SKIP LOCKED` for:

- range leases;
- snapshot jobs;
- candle jobs;
- aggregate refresh jobs.

Introduce NATS, Kafka, or Redpanda only if:

- workers need to scale across many hosts;
- Postgres queue contention appears in metrics;
- multiple downstream consumers need the same immutable event stream;
- replay from object storage is not enough.

## Runtime choice

### Phase 1

Keep TypeScript/Node for fastest delivery:

- add fetch concurrency;
- add range leases;
- add staging writes;
- defer enrichment;
- preserve existing tests and API types.

### Phase 2

Move the hot ingestion binary to Rust if profiling justifies it:

- stronger typed JSON/protobuf decoding;
- lower memory overhead under high concurrency;
- better CPU throughput for large catch-up;
- still writes to the same Postgres schema.

The API can remain TypeScript because API latency will be dominated by DB read-model queries, not CPU.

## Observability

Required metrics:

- `indexer_head_height`
- `indexer_confirmed_target_height`
- `indexer_cursor_height`
- `indexer_confirmed_lag_blocks`
- `indexer_fetch_blocks_per_second`
- `indexer_fetch_rpc_requests_in_flight`
- `indexer_fetch_rpc_error_total{status}`
- `indexer_decode_blocks_per_second`
- `indexer_writer_blocks_per_second`
- `indexer_writer_commit_seconds`
- `indexer_range_lease_oldest_age_seconds`
- `indexer_snapshot_jobs_pending`
- `indexer_candle_jobs_pending`
- `indexer_db_copy_rows_total`
- `indexer_db_merge_seconds`
- `indexer_reorg_halt`

Logs should include structured fields:

```text
role, worker_id, range_from, range_to, height, cursor, head, target, lag,
blocks, txs, normalized_events, swaps, liquidity_events, incentive_events,
duration_ms, rpc_errors, db_duration_ms
```

## Recommended implementation plan

### Task 1: Add performance config

Add environment variables:

```text
INDEXER_MODE=catchup|realtime
RANGE_SIZE=5000
FETCH_WINDOW_SIZE=250
FETCH_CONCURRENCY=32
REALTIME_FETCH_CONCURRENCY=8
INGEST_CANDLES_INLINE=false
INGEST_RESERVE_SNAPSHOTS_INLINE=false
INGEST_AGGREGATES_INLINE=false
```

### Task 2: Refactor block acquisition

Create a block fetcher that can fetch a height range with bounded concurrency and return block bundles sorted by height. Keep current `JunoRpcClient.block(height)` as the single-height primitive.

### Task 3: Ordered writer

Split current `Indexer.runOnce()` into:

- range planner;
- concurrent fetch;
- decode;
- ordered writer.

The ordered writer should retain one transaction per block at first. After correctness tests pass, add staging-table bulk merge for catch-up.

### Task 4: Defer reserve snapshots

Replace inline `writeReserveSnapshots()` calls with `snapshot_jobs` inserts. Add a worker command:

```bash
npm run worker:snapshots
```

### Task 5: Defer candles

Add `candle_jobs` or make the existing `backfill:candles` range-aware and continuously runnable. Remove inline candle writes from swap insertion when `INGEST_CANDLES_INLINE=false`.

### Task 6: Bulk staging

Add staging tables and COPY-based loading for decoded batches. Use merge SQL into canonical tables with `ON CONFLICT DO NOTHING` or conflict-specific updates.

### Task 7: Read models

Move `/stats`, `/pools`, candles, wallet history, and wallet positions to precomputed read models so API traffic never scans raw event tables under load.

### Task 8: Optional Rust ingestion

After TypeScript pipeline metrics exist, benchmark:

- Node fetch/decode/write;
- Rust fetch/decode/write;
- source endpoint saturation;
- Postgres merge throughput.

Only rewrite if Node is the measured bottleneck.

## First milestone acceptance criteria

- Catch-up can process a 10,000-block historical range with `FETCH_CONCURRENCY > 1`.
- Blocks are committed in strict height order.
- Cursor advances only after canonical fact writes commit.
- Snapshot and candle failures cannot block block ingestion.
- Re-running the same range is idempotent.
- `/health` exposes fetch, writer, cursor, and lag metrics.
- A staging run documents measured blocks/sec, RPC error rate, DB CPU, and DB write IOPS.

## Risks

| Risk | Mitigation |
|---|---|
| Provider rate limits dominate | use paid archive endpoints or self-host archive node |
| Out-of-order fetch complicates reorg handling | only ordered writer advances cursor |
| Bulk writes bypass invariants | merge into canonical tables with existing unique constraints |
| Snapshot backlog grows | rate-limit, prioritize recent heights, make historical snapshots best-effort |
| Continuous aggregates amplify hot writes | exclude hottest bucket or use explicit rollup jobs |
| Postgres queue contention appears | introduce external queue only after metrics show contention |

## Bottom line

The fastest architecture is not a faster loop around the current serial indexer. It is a pipeline:

- concurrent source acquisition;
- deterministic ordered commit;
- bulk database writes;
- deferred enrichment;
- precomputed API read models;
- source and database metrics driving concurrency.

That design keeps correctness understandable while letting catch-up use all available RPC and Postgres capacity.
