import { useState } from "react";
import type { RouteQuote } from "../../queries/useSwapQuote";
import type { RegistryAsset } from "../../config/registry";
import { routeSymbols } from "../../lib/astroport/routes";
import { formatAmount } from "../../lib/format/amounts";
import { formatBpsPercent, getPriceImpact } from "../../lib/swap/slippage";
import { EmptyState, ErrorState, Skeleton } from "../common";

export function QuoteCard({
  quote,
  askAsset,
  offerAsset,
  isLoading,
  error,
  slippageBps,
  updatedAt,
}: {
  quote?: RouteQuote;
  askAsset?: RegistryAsset;
  offerAsset?: RegistryAsset;
  isLoading: boolean;
  error?: unknown;
  slippageBps: number;
  updatedAt?: number;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const updatedAtLabel = updatedAt ? new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : undefined;
  const priceImpact = quote ? getPriceImpact({ spreadAmount: quote.spread_amount, returnAmount: quote.return_amount }) : null;
  const priceImpactClass = priceImpact?.severity === "high" ? "status-danger" : priceImpact?.severity === "warning" ? "status-warn" : "status-ok";
  const route = quote?.route;
  const isRouterRoute = quote?.source === "router";
  const feeLabel = quote && askAsset ? `${formatAmount(quote.commission_amount, askAsset.decimals)} ${askAsset.symbol}` : "—";
  const rateLabel = quote && offerAsset && askAsset
    ? `1 ${offerAsset.symbol} = ${(Number(formatAmount(quote.return_amount, askAsset.decimals).replace(/,/g, "")) / Number(formatAmount(quote.offer_amount, offerAsset.decimals).replace(/,/g, "") || "1")).toLocaleString(undefined, { maximumSignificantDigits: 6 })} ${askAsset.symbol}`
    : "—";

  return (
    <section className="quote-card">
      <div className="quote-header">
        <button className="quote-toggle" type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)}>
          <span className="quote-toggle-triangle" aria-hidden="true" />
          <span className="eyebrow">Quote details</span>
        </button>
      </div>
      {isLoading ? <strong><Skeleton width="10rem" /> Querying route…</strong> : null}
      {error ? <ErrorState title="Route preview unavailable" error={error instanceof Error ? `${error.message}. Swaps stay disabled until a route can be simulated.` : `Swaps stay disabled until route simulation recovers. ${String(error)}`} /> : null}
      {quote && askAsset && route && detailsOpen ? (
        <>
          <dl className="quote-details">
            {quote.mode === "exact-out" && offerAsset ? <div><dt>Required input</dt><dd className="quote-detail-value">{formatAmount(quote.offer_amount, offerAsset.decimals)} {offerAsset.symbol}</dd></div> : null}
            <div><dt>Rate</dt><dd className="quote-detail-value">{rateLabel}</dd></div>
            <div><dt>Network fee</dt><dd className="quote-detail-value">{feeLabel}</dd></div>
            <div><dt>Max slippage</dt><dd className="quote-detail-value">{formatBpsPercent(slippageBps)}</dd></div>
            <div><dt>Price impact</dt><dd className={`quote-detail-value ${priceImpactClass}`}>{isRouterRoute ? "—" : priceImpact ? formatBpsPercent(priceImpact.bps) : "—"}</dd></div>
            <div><dt>Route</dt><dd className="quote-detail-value">{routeSymbols(route)} · {route.hops.length} hop{route.hops.length === 1 ? "" : "s"}</dd></div>
            {updatedAtLabel ? <div><dt>Updated</dt><dd className="quote-detail-value">{updatedAtLabel}</dd></div> : null}
          </dl>
          {quote.errors?.length ? <p className="error-text">Some candidate routes could not be simulated: {quote.errors.join("; ")}</p> : null}
        </>
      ) : null}
      {(!quote || !askAsset || !route) ? <EmptyState title="Waiting for amount">Enter an amount to quote the best direct or router path.</EmptyState> : null}
    </section>
  );
}
