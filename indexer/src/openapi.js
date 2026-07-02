export const openApiDocument = {
  openapi: "3.1.0",
  info: { title: "Astroport Juno Indexer API", version: "0.1.0" },
  servers: [{ url: "/" }],
  paths: {
    "/health": { get: { summary: "Health and data-source status" } },
    "/stats": { get: { summary: "Protocol TVL, volume, fee and pool totals" } },
    "/prices": { get: { summary: "Resolve one or more native, IBC or CW20 assets to USD prices" } },
    "/prices/{asset}": { get: { summary: "Resolve a native denom, IBC denom or CW20 contract to a USD price" } },
    "/pools": { get: { summary: "List pools with TVL, volume, fees and APR metrics" } },
    "/pools/{id}": { get: { summary: "Pool detail by id or pair address" } },
    "/pools/{id}/candles": {
      get: {
        summary: "Paginated OHLC candles for a pool",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "interval", in: "query", schema: { type: "string", enum: ["5m", "1h", "1d"], default: "1h" } },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "baseAsset", in: "query", schema: { type: "string" } },
          { name: "quoteAsset", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 200 } },
          { name: "cursor", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Candle page. Empty production deployments return data: [] until indexer storage is wired/backfilled.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/CandlePage" } } },
          },
          400: { description: "Invalid interval or timestamp range" },
          404: { description: "Pool not found" },
        },
      },
    },
    "/pools/{id}/positions": { get: { summary: "Paginated LP positions for a pool" } },
    "/wallets/{addr}/positions": { get: { summary: "Paginated LP positions for a wallet" } },
    "/wallets/{addr}/history": { get: { summary: "Paginated transaction history for a wallet" } },
  },
  components: {
    schemas: {
      Candle: {
        type: "object",
        required: ["poolId", "pairAddress", "baseAsset", "quoteAsset", "interval", "bucketStart", "open", "high", "low", "close", "volume", "volumeQuote", "tradeCount", "dataSource", "isMock"],
        properties: {
          poolId: { type: ["string", "null"] },
          pairAddress: { type: ["string", "null"] },
          baseAsset: { type: ["string", "null"] },
          quoteAsset: { type: ["string", "null"] },
          interval: { type: "string", enum: ["5m", "1h", "1d"] },
          bucketStart: { type: "string", format: "date-time" },
          open: { type: "number" },
          high: { type: "number" },
          low: { type: "number" },
          close: { type: "number" },
          volume: { type: "number" },
          volumeQuote: { type: "number" },
          tradeCount: { type: "integer" },
          dataSource: { type: "string", enum: ["indexer", "mock"] },
          isMock: { type: "boolean" },
        },
      },
      CandlePage: {
        type: "object",
        properties: {
          data: { type: "array", items: { $ref: "#/components/schemas/Candle" } },
          pagination: { type: "object", properties: { limit: { type: "integer" }, nextCursor: { type: ["string", "null"] } } },
          meta: { type: "object" },
        },
      },
    },
  },
};
