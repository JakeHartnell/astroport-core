import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HttpJsonPriceSource,
  PriceResolver,
  StaticPriceSource,
  normalizeAssetId,
} from "../src/pricing.js";

const NOW = new Date("2026-07-02T12:00:00.000Z");

describe("USD pricing resolver", () => {
  it("normalizes native, IBC and CW20 asset identifiers", () => {
    assert.equal(normalizeAssetId(" ujuno "), "ujuno");
    assert.equal(normalizeAssetId("ujunox"), "ujuno");
    assert.equal(normalizeAssetId("ibc/abc123"), "ibc/ABC123");
    assert.equal(normalizeAssetId({ native_token: { denom: "IBC/deadbeef" } }), "ibc/DEADBEEF");
    assert.equal(normalizeAssetId({ token: { contract_addr: "JUNO1CW20CONTRACT" } }), "juno1cw20contract");
  });

  it("flags stale and missing prices without silently returning zero", async () => {
    const resolver = new PriceResolver({
      now: () => NOW,
      staleAfterMs: 60_000,
      sources: [new StaticPriceSource({ prices: [{ asset: "ujuno", priceUsd: 1.2, observedAt: "2026-07-02T11:00:00.000Z" }] })],
    });

    const stale = await resolver.resolve("ujuno");
    assert.equal(stale.status, "stale");
    assert.equal(stale.priceUsd, 1.2);
    assert.equal(stale.stale, true);

    const missing = await resolver.resolve("ibc/unknown");
    assert.equal(missing.status, "missing");
    assert.equal(missing.priceUsd, null);
  });

  it("can reject stale prices when configured", async () => {
    const resolver = new PriceResolver({
      now: () => NOW,
      staleAfterMs: 60_000,
      allowStale: false,
      sources: [new StaticPriceSource({ prices: [{ asset: "ujuno", priceUsd: 1.2, observedAt: "2026-07-02T11:00:00.000Z" }] })],
    });

    const price = await resolver.resolve("ujuno");
    assert.equal(price.status, "missing");
    assert.equal(price.priceUsd, null);
  });

  it("resolves mocked provider responses through source abstraction", async () => {
    const source = new HttpJsonPriceSource({
      baseUrl: "https://prices.invalid/v1/price",
      name: "test-provider",
      apiKey: "redacted",
      fetchImpl: async (url, init) => {
        assert.equal(url.searchParams.get("asset"), "ujuno");
        assert.equal(init.headers["x-api-key"], "redacted");
        return Response.json({ asset: "ujuno", priceUsd: "1.42", observedAt: NOW.toISOString() });
      },
    });
    const resolver = new PriceResolver({ now: () => NOW, sources: [source] });

    const price = await resolver.resolve("ujuno");
    assert.equal(price.priceUsd, 1.42);
    assert.equal(price.source, "test-provider");
    assert.equal(price.status, "fresh");
  });
});
