# Astroport Juno indexer API

Small dependency-free REST API skeleton for frontend metrics while ingestion/pricing storage is wired in.
By default it returns empty, correctly-shaped responses. Set `INDEXER_DEV_MOCKS=true` only for local development; mock responses include `dataSource: "mock"` and `isMock: true`.

## Run

```bash
cd indexer
npm test
PORT=8787 npm start
# local demo data only:
INDEXER_DEV_MOCKS=true PORT=8787 npm start
```

## Endpoints

- `GET /health` — probe status and whether responses are mock-backed.
- `GET /stats` — protocol totals: TVL, 24h/7d volume, 24h fees, pool counts.
- `GET /prices?assets=ujuno,ibc/HASH` / `GET /prices/:asset` — denom/CW20/IBC → USD resolver. Returns `status: "fresh" | "stale" | "missing"`; unknown prices are `null`, never silently zero.
- `GET /pools?limit=50&cursor=0` — pool list with `tvlUsd`, `volume24hUsd`, `feeApr`, `incentivesApr`, `totalApr`, fees and asset reserves.
- `GET /pools/:id` — detail by pool id or pair address.
- `GET /pools/:id/candles?interval=1h&from=&to=&baseAsset=&quoteAsset=&limit=200&cursor=0` — paginated OHLC candles for charting. Supported intervals are `5m`, `1h`, and `1d`; `limit` is clamped to 500. Production defaults are empty until the backing `token_candles` table is populated. Local dev mock candles are explicitly marked with `dataSource: "mock"` and `isMock: true`.
- `GET /pools/:id/positions?limit=50&cursor=0` — paginated LP positions in a pool.
- `GET /wallets/:addr/positions?limit=50&cursor=0` — paginated LP positions for a wallet.
- `GET /wallets/:addr/history?limit=50&cursor=0` — paginated wallet transaction history.
- `GET /openapi.json` — compact OpenAPI entrypoint for typed client generation.

APR convention: trading fee APR is `(volume24hUsd * feeBps / 10000 * 365) / tvlUsd * 100`; incentive APR is `(emissionsPerDayUsd * 365) / tvlUsd * 100`; total APR is their sum.

## Pricing configuration

Production mode does not fabricate prices. Configure at least one real source or ingest `token_prices` rows before expecting USD values:

| Variable | Description |
| --- | --- |
| `PRICE_PROVIDER_BASE_URL` | Optional HTTP JSON price endpoint. The API calls it with `?asset=<normalized denom-or-contract>` and accepts `{ asset, priceUsd, observedAt }`, `{ prices: [...] }`, `{ data: [...] }`, or `{ "ujuno": 1.23 }` shapes. |
| `PRICE_PROVIDER_API_KEY` | Optional provider key sent as `Authorization: Bearer` and `x-api-key`. |
| `PRICE_PROVIDER_NAME` | Source label returned in resolver responses, default `provider`. |
| `PRICE_CACHE_TTL_MS` | In-process resolver cache TTL, default 300000. |
| `PRICE_STALE_AFTER_MS` | Freshness window before a price is flagged `stale`, default 1800000. |
| `PRICE_ALLOW_STALE` | Set `false` to return `status: "missing"`/`priceUsd: null` for stale source records. |
| `PRICE_DEV_MOCKS` / `INDEXER_DEV_MOCKS` | Opt-in local mocks only; mock prices and derived metrics are marked with `source: "mock"`/`isMock: true`. |

Pool normalization annotates asset rows with price metadata and can derive `tvlUsd`/fee APR from reserves when resolver inputs are available. Missing prices remain `null` and keep calculations from silently treating unknown assets as $0.
