import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateIncentiveApr, calculateTradingFeeApr, normalizePoolRecord } from "../src/calculations.js";

describe("indexer metric calculations", () => {
  it("calculates fee APR from 24h volume, pool fee and TVL", () => {
    assert.equal(calculateTradingFeeApr({ volume24hUsd: 1_000, feeBps: 30, tvlUsd: 10_000 }), 10.95);
  });

  it("calculates incentive APR from daily emissions value and TVL", () => {
    assert.equal(calculateIncentiveApr({ emissionsPerDayUsd: 10, tvlUsd: 10_000 }), 36.5);
  });

  it("normalizes snake_case pool rows and derives fees/APR", () => {
    const pool = normalizePoolRecord({
      pair_address: "juno1pair",
      tvl_usd: "10000",
      volume_24h_usd: "1000",
      fee_bps: "30",
      emissions_per_day_usd: "10",
    });
    assert.equal(pool.pairAddress, "juno1pair");
    assert.equal(pool.fees24hUsd, 3);
    assert.equal(pool.feeApr, 10.95);
    assert.equal(pool.incentivesApr, 36.5);
    assert.equal(pool.totalApr, 47.45);
  });

  it("returns zero APRs when TVL is unavailable", () => {
    const pool = normalizePoolRecord({ pairAddress: "juno1empty", volume24hUsd: 1000, feeBps: 30 });
    assert.equal(pool.feeApr, 0);
    assert.equal(pool.incentivesApr, 0);
    assert.equal(pool.totalApr, 0);
  });

  it("derives asset values, TVL and fee APR from resolver prices when explicit TVL is absent", () => {
    const pool = normalizePoolRecord({
      pairAddress: "juno1priced",
      volume24hUsd: 100,
      feeBps: 30,
      assets: [
        { denom: "ujunox", reserve: "1000000", decimals: 6 },
        { denom: "ibc/mock-usdc", reserve: "2000000", decimals: 6 },
      ],
    }, {
      prices: [
        { asset: "ujuno", priceUsd: 1.25, status: "fresh", source: "stored", observedAt: "2026-07-02T00:00:00.000Z" },
        { asset: "ibc/MOCK-USDC", priceUsd: 1, status: "fresh", source: "stored", observedAt: "2026-07-02T00:00:00.000Z" },
      ],
    });

    assert.equal(pool.assets[0].denom, "ujuno");
    assert.equal(pool.assets[0].valueUsd, 1.25);
    assert.equal(pool.assets[1].valueUsd, 2);
    assert.equal(pool.tvlUsd, 3.25);
    assert.equal(pool.feeApr, 3369.2307692307695);
  });
});
