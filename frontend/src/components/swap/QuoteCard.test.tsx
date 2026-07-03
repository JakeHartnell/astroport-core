import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { dexRegistry } from "../../config/registry";
import type { RouteQuote } from "../../queries/useSwapQuote";
import { QuoteCard } from "./QuoteCard";

vi.mock("../../queries/usePools", () => ({
  usePoolCandles: () => ({
    data: [],
    access: { source: "indexer", isFallback: false, isMock: false, isStale: false },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

describe("QuoteCard layout", () => {
  it("marks quote details so long values can wrap inside the card", () => {
    const pool = dexRegistry.pools[0];
    const askAsset = pool.assets[1];
    const quote: RouteQuote = {
      offer_amount: "1000000",
      return_amount: "123456789012345678901234567890",
      spread_amount: "12345678901234567890",
      commission_amount: "12345678901234567890",
      source: "pair",
      mode: "exact-in",
      route: {
        id: "direct",
        hops: [{ pool, offerAsset: pool.assets[0], askAsset: pool.assets[1] }],
        operations: [],
      },
    };

    render(<QuoteCard quote={quote} askAsset={askAsset} isLoading={false} slippageBps={50} />);

    fireEvent.click(screen.getByRole("button", { name: /quote details/i }));
    const detailsLabel = screen.getAllByText("Route").find((element) => element.tagName === "DT");
    const details = detailsLabel?.closest("dl");
    expect(details?.className).toBe("quote-details");
    expect(screen.getByText(/JUNO → JUNOAGENT-TEST/i).closest("dd")?.className).toBe("quote-detail-value");
  });

  it("keeps quote details compact for stable/PCL routes", () => {
    const pool = { ...dexRegistry.pools[0], type: "stable" as const };
    const askAsset = pool.assets[1];
    const quote: RouteQuote = {
      offer_amount: "1000000",
      return_amount: "1000000",
      spread_amount: "1000",
      commission_amount: "500",
      source: "pair",
      mode: "exact-in",
      route: {
        id: "stable-direct",
        hops: [{ pool, offerAsset: pool.assets[0], askAsset: pool.assets[1] }],
        operations: [],
      },
    };

    render(<QuoteCard quote={quote} askAsset={askAsset} isLoading={false} slippageBps={50} />);

    fireEvent.click(screen.getByRole("button", { name: /quote details/i }));
    expect(screen.getByText("Network fee")).toBeTruthy();
    expect(screen.getByText("Max slippage")).toBeTruthy();
    expect(screen.queryByText(/contract-simulated/i)).toBeNull();
    expect(screen.queryByText(/pool math is not recomputed locally/i)).toBeNull();
  });
});
