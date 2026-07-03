export const openApiDocument = {
  openapi: "3.1.0",
  info: { title: "Astroport Juno Production Indexer API", version: "0.1.0" },
  servers: [{ url: "/" }],
  paths: {
    "/health": { get: { summary: "Liveness plus indexer cursor/lag metadata" } },
    "/ready": { get: { summary: "Readiness: database reachable and migrations visible" } },
    "/openapi.json": { get: { summary: "OpenAPI document" } },
    "/stats": { get: { summary: "Protocol TVL, volume, fee and pool totals" } },
    "/prices": { get: { summary: "Resolve one or more assets to USD/JUNO prices" } },
    "/prices/{asset}": { get: { summary: "Resolve a native denom, IBC denom or CW20 contract price" } },
    "/pools": { get: { summary: "List pools with TVL, volume, fee and APR metrics" } },
    "/pools/{id}": { get: { summary: "Pool detail by UUID or pair address" } },
    "/pools/{id}/candles": { get: { summary: "Paginated OHLC candles for a pool" } },
    "/pools/{id}/positions": { get: { summary: "Paginated LP positions for a pool" } },
    "/wallets/{addr}/positions": { get: { summary: "Paginated LP positions for a wallet" } },
    "/wallets/{addr}/history": { get: { summary: "Paginated wallet transaction history" } },
  },
};
