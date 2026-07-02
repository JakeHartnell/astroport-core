import { describe, expect, it, vi } from "vitest";
import { createIndexerClient } from "./client";

describe("indexer typed client", () => {
  it("fetches paginated pool metrics from /pools", async () => {
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify({ data: [], pagination: { limit: 10, nextCursor: null } }), { status: 200 })) as unknown as typeof fetch;
    const client = createIndexerClient({ baseUrl: "https://indexer.example/", fetcher });
    const pools = await client.pools({ limit: 10 });
    expect(fetcher).toHaveBeenCalledWith("https://indexer.example/pools?limit=10", undefined);
    expect(pools.pagination.limit).toBe(10);
  });

  it("fetches USD prices from /prices", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ asset: "ujuno", priceUsd: 1.25, source: "stored", status: "fresh", stale: false, observedAt: "2026-07-02T00:00:00.000Z", ageMs: 0, isMock: false }] }), { status: 200 })) as unknown as typeof fetch;
    const client = createIndexerClient({ baseUrl: "https://indexer.example/", fetcher });
    const prices = await client.prices(["ujuno", "ibc/mock"]);
    expect(fetcher).toHaveBeenCalledWith("https://indexer.example/prices?assets=ujuno%2Cibc%2Fmock", undefined);
    expect(prices.data[0].priceUsd).toBe(1.25);
  });

  it("fetches pool candles with interval and range filters", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [], pagination: { limit: 25, nextCursor: null }, meta: { interval: "1h", isMock: false } }), { status: 200 })) as unknown as typeof fetch;
    const client = createIndexerClient({ baseUrl: "https://indexer.example/", fetcher });
    const candles = await client.poolCandles("juno1pool", { interval: "1h", from: "2026-07-01T00:00:00.000Z", to: "2026-07-02T00:00:00.000Z", baseAsset: "ujuno", quoteAsset: "ibc/usdc", limit: 25 });
    expect(fetcher).toHaveBeenCalledWith("https://indexer.example/pools/juno1pool/candles?interval=1h&from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-02T00%3A00%3A00.000Z&baseAsset=ujuno&quoteAsset=ibc%2Fusdc&limit=25", undefined);
    expect(candles.meta?.interval).toBe("1h");
  });

  it("throws on unavailable indexer responses", async () => {
    const fetcher = vi.fn(async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    const client = createIndexerClient({ baseUrl: "https://indexer.example", fetcher });
    await expect(client.health()).rejects.toThrow("Indexer request failed: 503");
  });
});
