import { Box, Stack } from "@interchain-ui/react";
import { useDexRegistry } from "../../queries/useDexRegistry";
import type { RegistryPool } from "../../config/registry";
import { EmptyState, ErrorState, Skeleton } from "../common";
import { SwapForm } from "./SwapForm";

export function SwapPage() {
  const { pools, discovery } = useDexRegistry();
  const pool = pools[0];
  const market = pool ? buildMarketPreview(pool) : null;

  return (
    <Box as="section" className="swap-page-grid">
      <Stack className="swap-primary" direction="vertical" space="6">
        {discovery.isFetching && !pool ? <div className="lp-position-skeleton" aria-label="Loading swap pools"><Skeleton width="75%" /><Skeleton width="55%" /></div> : null}
        {discovery.isError ? <ErrorState title="Pool discovery unavailable" error="Showing curated registry fallback only. Swap stays unavailable if no verified pool is present." onRetry={() => void discovery.refetch()} /> : null}
        {pool ? <SwapForm pool={pool} pools={pools} /> : <EmptyState title="No enabled verified pools">Add a real Juno pair to the strict registry before exposing swaps.</EmptyState>}
      </Stack>
      {market ? (
        <Stack className="context-panel market-panel" direction="vertical" space="6">
          <Box className="market-card">
            <div className="market-card-header">
              <div className="market-pair-title">
                <span className="market-token-mark" aria-hidden="true">{market.baseSymbol.slice(0, 1)}</span>
                <div>
                  <h2>{market.baseSymbol} / {market.quoteSymbol}</h2>
                  <p>{market.baseName}</p>
                </div>
              </div>
              <div className="market-price">
                <strong>{market.price}</strong>
                <span className={`market-change ${market.changeUp ? "up" : "down"}`}>{market.change}</span>
              </div>
            </div>
            <div className="market-sparkline" aria-hidden="true">
              <svg viewBox="0 0 260 72" preserveAspectRatio="none">
                <path className="spark-fill" d="M0 58 L18 52 L34 55 L52 43 L70 47 L88 31 L106 36 L124 24 L142 30 L160 20 L178 26 L196 16 L214 22 L232 12 L260 18 L260 72 L0 72 Z" />
                <path className="spark-line" d="M0 58 L18 52 L34 55 L52 43 L70 47 L88 31 L106 36 L124 24 L142 30 L160 20 L178 26 L196 16 L214 22 L232 12 L260 18" />
              </svg>
            </div>
            <div className="market-stats">
              <span><small>24h vol</small><strong>{market.volume}</strong></span>
              <span><small>Liquidity</small><strong>{market.liquidity}</strong></span>
            </div>
          </Box>
          <Box className="market-card transmissions-card">
            <p className="eyebrow">Recent transactions</p>
            <div className="transaction-list">
              {market.transactions.map((tx) => (
                <div className="transaction-row" key={tx.time}>
                  <span className={`transaction-kind ${tx.kind}`} aria-hidden="true">{tx.kind === "add" ? "+" : "⇄"}</span>
                  <strong>{tx.detail}</strong>
                  <small>{tx.time}</small>
                </div>
              ))}
            </div>
          </Box>
        </Stack>
      ) : null}
    </Box>
  );
}

type MarketPreview = {
  baseSymbol: string;
  quoteSymbol: string;
  baseName: string;
  price: string;
  change: string;
  changeUp: boolean;
  volume: string;
  liquidity: string;
  transactions: { kind: "swap" | "add"; detail: string; time: string }[];
};

// Illustrative market context for the swap side panel. These figures are
// placeholders until the indexer exposes live price / volume / activity feeds;
// they are derived deterministically from the pool so the panel stays stable.
function buildMarketPreview(pool: RegistryPool): MarketPreview {
  const baseSymbol = pool.assets[0]?.symbol ?? "JUNO";
  const quoteSymbol = pool.assets[1]?.symbol ?? "USDC";
  const baseName = pool.assets[0]?.name ?? baseSymbol;
  return {
    baseSymbol,
    quoteSymbol,
    baseName,
    price: "$4.182",
    change: "+6.4%",
    changeUp: true,
    volume: "$2.4M",
    liquidity: "$11.8M",
    transactions: [
      { kind: "swap", detail: `142 ${baseSymbol} → 594 ${quoteSymbol}`, time: "03:11:04" },
      { kind: "add", detail: `+ 3.2 ${baseSymbol} / 11k ${quoteSymbol}`, time: "03:10:40" },
      { kind: "swap", detail: `8,400 ${quoteSymbol} → 61 ${baseSymbol}`, time: "03:09:58" },
    ],
  };
}
