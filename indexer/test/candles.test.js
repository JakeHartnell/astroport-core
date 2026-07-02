import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateCandlesFromSwaps, bucketStartFor, deriveSwapPrice, filterCandles, parseCandleLimit } from "../src/candles.js";

describe("candle aggregation", () => {
  it("floors timestamps into supported candle buckets", () => {
    assert.equal(bucketStartFor("2026-07-02T12:34:56.000Z", "5m"), "2026-07-02T12:30:00.000Z");
    assert.equal(bucketStartFor("2026-07-02T12:34:56.000Z", "1h"), "2026-07-02T12:00:00.000Z");
    assert.equal(bucketStartFor("2026-07-02T12:34:56.000Z", "1d"), "2026-07-02T00:00:00.000Z");
  });

  it("derives decimals-aware base/quote prices from either swap direction", () => {
    assert.deepEqual(deriveSwapPrice({ offerAsset: "ujuno", offerAmount: "1000000", askAsset: "uusdc", returnAmount: "1250000" }, { baseAsset: "ujuno", quoteAsset: "uusdc", decimals: { ujuno: 6, uusdc: 6 } }), { price: 1.25, baseVolume: 1, quoteVolume: 1.25 });
    assert.deepEqual(deriveSwapPrice({ offerAsset: "uusdc", offerAmount: "2500000", askAsset: "ujuno", returnAmount: "2000000" }, { baseAsset: "ujuno", quoteAsset: "uusdc", decimals: { ujuno: 6, uusdc: 6 } }), { price: 1.25, baseVolume: 2, quoteVolume: 2.5 });
  });

  it("aggregates swaps into coherent OHLC candles", () => {
    const candles = aggregateCandlesFromSwaps([
      { pairAddress: "juno1pair", timestamp: "2026-07-02T12:01:00.000Z", offerAsset: "ujuno", offerAmount: "1000000", askAsset: "uusdc", returnAmount: "1000000" },
      { pairAddress: "juno1pair", timestamp: "2026-07-02T12:20:00.000Z", offerAsset: "ujuno", offerAmount: "1000000", askAsset: "uusdc", returnAmount: "1200000" },
      { pairAddress: "juno1pair", timestamp: "2026-07-02T12:50:00.000Z", offerAsset: "uusdc", offerAmount: "900000", askAsset: "ujuno", returnAmount: "1000000" },
      { pairAddress: "juno1pair", timestamp: "2026-07-02T13:00:00.000Z", offerAsset: "ujuno", offerAmount: "1000000", askAsset: "uusdc", returnAmount: "1300000" },
    ], { interval: "1h", baseAsset: "ujuno", quoteAsset: "uusdc", decimals: { ujuno: 6, uusdc: 6 } });

    assert.equal(candles.length, 2);
    assert.equal(candles[0].bucketStart, "2026-07-02T12:00:00.000Z");
    assert.equal(candles[0].open, 1);
    assert.equal(candles[0].high, 1.2);
    assert.equal(candles[0].low, 0.9);
    assert.equal(candles[0].close, 0.9);
    assert.equal(candles[0].tradeCount, 3);
    assert.equal(candles[0].volume, 3);
  });

  it("filters ranges and clamps candle limits", () => {
    assert.equal(parseCandleLimit("9999"), 500);
    const candles = filterCandles([
      { poolId: "p", interval: "1h", bucketStart: "2026-07-02T12:00:00.000Z", open: 1, high: 1, low: 1, close: 1 },
      { poolId: "p", interval: "1h", bucketStart: "2026-07-02T13:00:00.000Z", open: 2, high: 2, low: 2, close: 2 },
    ], { interval: "1h", from: "2026-07-02T12:30:00.000Z" });
    assert.equal(candles.length, 1);
    assert.equal(candles[0].open, 2);
  });
});
