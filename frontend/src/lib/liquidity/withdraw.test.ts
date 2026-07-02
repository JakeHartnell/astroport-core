import { describe, expect, it } from "vitest";
import type { PoolResponse } from "../generated/Pair.types";
import { applySlippageToAssets, calculatePercentageFill, estimateWithdrawAssets } from "./withdraw";

const pool: PoolResponse = {
  total_share: "1000000000",
  assets: [
    { info: { native_token: { denom: "ujuno" } }, amount: "5000000000" },
    { info: { native_token: { denom: "factory/pair/token" } }, amount: "10000000000" },
  ],
};

describe("withdraw liquidity math", () => {
  it("calculates percentage fills from LP balances", () => {
    expect(calculatePercentageFill("100000000", 25)).toBe("25000000");
    expect(calculatePercentageFill("100000000", 50)).toBe("50000000");
    expect(calculatePercentageFill("3", 50)).toBe("1");
    expect(calculatePercentageFill(undefined, 100)).toBe("0");
  });

  it("estimates proportional underlying assets from reserves and total share", () => {
    expect(estimateWithdrawAssets(pool, "50000000")).toEqual([
      { info: { native_token: { denom: "ujuno" } }, amount: "250000000" },
      { info: { native_token: { denom: "factory/pair/token" } }, amount: "500000000" },
    ]);
  });

  it("computes minimum received assets after slippage", () => {
    const expected = estimateWithdrawAssets(pool, "50000000");
    expect(applySlippageToAssets(expected, 50).map((asset) => asset.amount)).toEqual(["248750000", "497500000"]);
  });
});
