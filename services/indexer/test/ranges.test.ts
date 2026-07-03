import { describe, expect, it } from "vitest";
import { nextBlockRange } from "../src/ranges.js";

describe("nextBlockRange", () => {
  it("returns an empty range when the confirmed target is behind the next cursor height", () => {
    expect(nextBlockRange({ lastHeight: 100, confirmedTarget: 100, batchSize: 20 })).toEqual({ from: 101, to: 100, empty: true });
  });

  it("limits the next range by batch size", () => {
    expect(nextBlockRange({ lastHeight: 100, confirmedTarget: 150, batchSize: 20 })).toEqual({ from: 101, to: 120, empty: false });
  });

  it("caps the next range at an explicit backfill end height", () => {
    expect(nextBlockRange({ lastHeight: 100, confirmedTarget: 150, batchSize: 20, maxHeight: 110 })).toEqual({ from: 101, to: 110, empty: false });
  });

  it("returns empty after the explicit backfill end height has been reached", () => {
    expect(nextBlockRange({ lastHeight: 110, confirmedTarget: 150, batchSize: 20, maxHeight: 110 })).toEqual({ from: 111, to: 110, empty: true });
  });
});
