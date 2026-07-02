import { Box, Stack } from "@interchain-ui/react";
import { useDexRegistry } from "../../queries/useDexRegistry";
import { EmptyState, ErrorState, Skeleton } from "../common";
import { SwapForm } from "./SwapForm";

export function SwapPage() {
  const { pools, discovery } = useDexRegistry();
  const pool = pools[0];

  return (
    <Box as="section" className="swap-page-grid">
      <Stack className="swap-primary" direction="vertical" space="6">
        {discovery.isFetching && !pool ? <div className="lp-position-skeleton" aria-label="Loading swap pools"><Skeleton width="75%" /><Skeleton width="55%" /></div> : null}
        {discovery.isError ? <ErrorState title="Pool discovery unavailable" error="Showing curated registry fallback only. Swap stays unavailable if no verified pool is present." onRetry={() => void discovery.refetch()} /> : null}
        {pool ? <SwapForm pool={pool} pools={pools} /> : <EmptyState title="No enabled verified pools">Add a real Juno pair to the strict registry before exposing swaps.</EmptyState>}
      </Stack>
      <Stack className="context-panel market-panel" direction="vertical" space="6">
        <Box className="market-card">
          <div className="market-card-header">
            <div>
              <p className="eyebrow">Market signal</p>
              <h2>JUNO route</h2>
            </div>
            <strong>live</strong>
          </div>
          <div className="market-sparkline" aria-hidden="true">
            <svg viewBox="0 0 260 72" preserveAspectRatio="none">
              <path className="spark-fill" d="M0 58 L18 52 L34 55 L52 43 L70 47 L88 31 L106 36 L124 24 L142 30 L160 20 L178 26 L196 16 L214 22 L232 12 L260 18 L260 72 L0 72 Z" />
              <path className="spark-line" d="M0 58 L18 52 L34 55 L52 43 L70 47 L88 31 L106 36 L124 24 L142 30 L160 20 L178 26 L196 16 L214 22 L232 12 L260 18" />
            </svg>
          </div>
          <div className="market-stats">
            <span><small>24h vol</small><strong>routing</strong></span>
            <span><small>Depth</small><strong>indexed</strong></span>
            <span><small>Spread</small><strong>quoted</strong></span>
          </div>
        </Box>
        <Box className="market-card transmissions-card">
          <p className="eyebrow">Recent transmissions</p>
          <div className="transmission-list">
            {["Route simulated", "Pool reserves read", "Quote phase locked"].map((item, index) => (
              <div className="transmission-row" key={item}>
                <span aria-hidden="true" />
                <strong>{item}</strong>
                <small>0{index + 7}:1{index}</small>
              </div>
            ))}
          </div>
        </Box>
      </Stack>
    </Box>
  );
}
