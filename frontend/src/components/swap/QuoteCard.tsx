import { useState } from "react";
import type { RouteQuote } from "../../queries/useSwapQuote";
import type { RegistryAsset } from "../../config/registry";
import { routeSymbols } from "../../lib/astroport/routes";
import { formatAmount } from "../../lib/format/amounts";
import { getPoolTypeMetadata } from "../../lib/pools/poolTypes";
import { assessRouteRisk } from "../../lib/risk";
import { calculateMinimumReceived, formatBpsPercent, getPriceImpact } from "../../lib/swap/slippage";
import { EmptyState, ErrorState, ExplorerLink, RiskBadgeList, Skeleton } from "../common";
import { PriceCandleChart } from "../charts/PriceCandleChart";

export function QuoteCard({
  quote,
  askAsset,
  offerAsset,
  isLoading,
  error,
  slippageBps,
  updatedAt,
  expiresInMs,
  isExpired,
  onRefresh,
}: {
  quote?: RouteQuote;
  askAsset?: RegistryAsset;
  offerAsset?: RegistryAsset;
  isLoading: boolean;
  error?: unknown;
  slippageBps: number;
  updatedAt?: number;
  expiresInMs?: number;
  isExpired?: boolean;
  onRefresh?: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const updatedAtLabel = updatedAt ? new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : undefined;
  const priceImpact = quote ? getPriceImpact({ spreadAmount: quote.spread_amount, returnAmount: quote.return_amount }) : null;
  const priceImpactClass = priceImpact?.severity === "high" ? "status-danger" : priceImpact?.severity === "warning" ? "status-warn" : "status-ok";
  const route = quote?.route;
  const isRouterRoute = quote?.source === "router";
  const routeRisk = assessRouteRisk(route);
  const caveatedPoolTypes = route?.hops.filter((hop) => !getPoolTypeMetadata(hop.pool.type).supportsLocalPriceImpact).map((hop) => getPoolTypeMetadata(hop.pool.type).shortLabel) ?? [];
  const freshnessLabel = isExpired ? "expired" : expiresInMs !== undefined ? `expires in ${Math.ceil(expiresInMs / 1_000)}s` : undefined;
  const summaryReturn = quote && askAsset ? `${formatAmount(quote.return_amount, askAsset.decimals)} ${askAsset.symbol}` : "Waiting";
  const summaryImpact = isRouterRoute ? "router" : priceImpact ? formatBpsPercent(priceImpact.bps) : "—";

  return (
    <section className="quote-card">
      <div className="quote-header">
        <button className="quote-toggle" type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)}>
          <span className="eyebrow">Quote details</span>
          <span aria-hidden="true">{detailsOpen ? "-" : "+"}</span>
        </button>
        <div className="quote-actions">
          {freshnessLabel ? <span className={`status-pill ${isExpired ? "status-danger" : "status-ok"}`}>{freshnessLabel}</span> : null}
          <button className="text-button" type="button" onClick={onRefresh} disabled={isLoading || !quote}>Refresh quote</button>
          {isLoading ? <span className="status-pill status-warn">refreshing</span> : quote && !isExpired ? <span className="status-pill status-ok">live</span> : quote && isExpired ? <span className="status-pill status-danger">stale</span> : <span className="status-pill">waiting</span>}
        </div>
      </div>
      {quote && askAsset && route ? (
        <div className="quote-summary-row">
          <span><small>Return</small><strong>{summaryReturn}</strong></span>
          <span><small>Impact</small><strong className={priceImpactClass}>{summaryImpact}</strong></span>
          <span><small>Route</small><strong>{route.hops.length} hop{route.hops.length === 1 ? "" : "s"}</strong></span>
        </div>
      ) : null}
      {isLoading ? <strong><Skeleton width="10rem" /> Querying route…</strong> : null}
      {error ? <ErrorState title="Route preview unavailable" error={error instanceof Error ? `${error.message}. Swaps stay disabled until a route can be simulated.` : `Swaps stay disabled until route simulation recovers. ${String(error)}`} /> : null}
      {quote && askAsset && route && detailsOpen ? (
        <>
          <dl className="quote-details">
            {quote.mode === "exact-out" && offerAsset ? <div><dt>Required input</dt><dd className="quote-detail-value">{formatAmount(quote.offer_amount, offerAsset.decimals)} {offerAsset.symbol}</dd></div> : null}
            <div><dt>{quote.mode === "exact-out" ? "Requested receive" : "Return"}</dt><dd className="quote-detail-value">{formatAmount(quote.return_amount, askAsset.decimals)} {askAsset.symbol}</dd></div>
            <div><dt>Minimum receive ({formatBpsPercent(slippageBps)})</dt><dd className="quote-detail-value">{formatAmount(calculateMinimumReceived(quote.return_amount, slippageBps), askAsset.decimals)} {askAsset.symbol}</dd></div>
            <div><dt>Price impact</dt><dd className={`quote-detail-value ${priceImpactClass}`}>{isRouterRoute ? "Router aggregate unavailable" : priceImpact ? `${formatBpsPercent(priceImpact.bps)}${caveatedPoolTypes.length ? " · contract-simulated" : ""}` : "—"}</dd></div>
            <div><dt>Spread</dt><dd className="quote-detail-value">{isRouterRoute ? "per-hop via router" : `${formatAmount(quote.spread_amount, askAsset.decimals)} ${askAsset.symbol}`}</dd></div>
            <div><dt>Commission / fee</dt><dd className="quote-detail-value">{isRouterRoute ? "included in router return" : `${formatAmount(quote.commission_amount, askAsset.decimals)} ${askAsset.symbol} · ${route.hops[0]?.pool.feeBps ?? 0} bps`}</dd></div>
            <div><dt>Route</dt><dd className="quote-detail-value">{routeSymbols(route)} · {route.hops.length} hop{route.hops.length === 1 ? "" : "s"}</dd></div>
            <div><dt>Risk</dt><dd className="quote-detail-value"><RiskBadgeList assessment={routeRisk} max={5} /></dd></div>
            <div><dt>Hops</dt><dd className="quote-detail-value">{route.hops.map((hop, index) => <span key={`${hop.pool.pair}-${index}`}>{index > 0 ? " · " : ""}{hop.offerAsset.symbol}/{hop.askAsset.symbol} <ExplorerLink href={hop.pool.explorer}>{hop.pool.pair}</ExplorerLink></span>)}</dd></div>
            <div><dt>Source</dt><dd className="quote-detail-value">{isRouterRoute ? (quote.mode === "exact-out" ? "router reverse_simulate_swap_operations" : "router simulate_swap_operations") : (quote.mode === "exact-out" ? "pair reverse simulation" : "pair simulation")}{updatedAtLabel ? ` · ${updatedAtLabel}` : ""}</dd></div>
          </dl>
          {caveatedPoolTypes.length ? <p className="price-impact-warning" role="status">{Array.from(new Set(caveatedPoolTypes)).join("/")} pool math is not recomputed locally. Pricing, spread, and fees come from contract simulation; liquidity forms show separate caveats where local estimates are unavailable.</p> : null}
          {route.hops[0]?.pool ? <PriceCandleChart pool={route.hops[0].pool} title="Route price" compact /> : null}
          {quote.errors?.length ? <p className="error-text">Some candidate routes could not be simulated: {quote.errors.join("; ")}</p> : null}
        </>
      ) : null}
      {(!quote || !askAsset || !route) ? <EmptyState title="Waiting for amount">Enter an amount to quote the best direct or router path.</EmptyState> : null}
    </section>
  );
}
