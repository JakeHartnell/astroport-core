import { useEffect, useMemo, useState } from "react";
import { Box, Button, Stack, Text } from "@interchain-ui/react";
import { type RegistryAsset, type RegistryPool } from "../../config/registry";
import type { SwapQuoteMode } from "../../lib/astroport/queries";
import { formatAmount, isBaseAmountGreaterThan, parseTokenAmount } from "../../lib/format/amounts";
import { assessRouteRisk } from "../../lib/risk";
import { calculateMinimumReceived, formatBpsPercent, getPriceImpact, slippageBpsToMaxSpread } from "../../lib/swap/slippage";
import { useSwapTx } from "../../mutations/useSwapTx";
import { useSwapQuote } from "../../queries/useSwapQuote";
import { getWalletBalanceAmount, useWalletBalances } from "../../queries/useWalletBalances";
import { useSlippageSettings } from "../../settings/SlippageSettingsContext";
import { useNetworkGuard, useWallet } from "../../wallet/WalletContext";
import { RiskAcknowledgement, TokenAmountInput } from "../common";
import { SettingsPanel } from "../settings/SettingsPanel";
import { TxStatusDialog } from "../tx/TxStatusDialog";
import { QuoteCard } from "./QuoteCard";
import { TokenSelect } from "./TokenSelect";

type SwapFormProps = {
  pool: RegistryPool;
  pools?: RegistryPool[];
};

function isPositiveBaseAmount(amount: string) {
  return /^\d+$/.test(amount) && BigInt(amount) > 0n;
}

function buildSelectableAssets(pools: RegistryPool[]) {
  const byId = new Map<string, RegistryAsset & { verified?: boolean; poolCount: number }>();
  for (const candidatePool of pools) {
    for (const asset of candidatePool.assets) {
      const existing = byId.get(asset.id);
      byId.set(asset.id, {
        ...existing,
        ...asset,
        logoURI: existing?.logoURI ?? asset.logoURI,
        verified: existing?.verified ?? candidatePool.verified ?? candidatePool.source !== "factory",
        poolCount: (existing?.poolCount ?? 0) + 1,
      });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function SwapForm({ pool, pools }: SwapFormProps) {
  const allPools = useMemo(() => pools && pools.length > 0 ? pools : [pool], [pool, pools]);
  const selectableAssets = useMemo(() => buildSelectableAssets(allPools), [allPools]);
  const { wallet } = useWallet();
  const { network } = useNetworkGuard();
  const [offerId, setOfferId] = useState(pool.assets[0].id);
  const [askId, setAskId] = useState(pool.assets[1].id);
  const [amount, setAmount] = useState("1");
  const [askAmount, setAskAmount] = useState("");
  const [quoteMode, setQuoteMode] = useState<SwapQuoteMode>("exact-in");
  const [highImpactConfirmed, setHighImpactConfirmed] = useState(false);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { slippageBps, formattedSlippagePercent, maxSpread } = useSlippageSettings();
  const offerAsset = selectableAssets.find((asset) => asset.id === offerId) ?? pool.assets[0];
  const askAsset = selectableAssets.find((asset) => asset.id === askId && asset.id !== offerAsset.id) ?? selectableAssets.find((asset) => asset.id !== offerAsset.id) ?? pool.assets[1];
  const parsedOfferInput = parseTokenAmount(amount, offerAsset.decimals);
  const parsedAskInput = parseTokenAmount(askAmount, askAsset.decimals);
  const quoteInputBaseAmount = quoteMode === "exact-out" ? parsedAskInput.baseAmount : parsedOfferInput.baseAmount;
  const activeParsedAmount = quoteMode === "exact-out" ? parsedAskInput : parsedOfferInput;
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const balances = useWalletBalances(walletAddress, allPools);
  const offerBalance = getWalletBalanceAmount(balances.data, offerAsset.id);
  const quote = useSwapQuote(allPools, offerAsset, askAsset, quoteInputBaseAmount, quoteMode);
  const signerOrClient = wallet.status === "connected" ? wallet.signer : undefined;
  const swapTx = useSwapTx(signerOrClient, walletAddress);
  const requiredOfferBaseAmount = quoteMode === "exact-out" && quote.data ? quote.data.offer_amount : parsedOfferInput.baseAmount;
  const hasAmount = activeParsedAmount.isValid && isPositiveBaseAmount(quoteInputBaseAmount);
  const sameToken = offerAsset.id === askAsset.id;
  const exceedsBalance = Boolean(offerBalance && isPositiveBaseAmount(requiredOfferBaseAmount) && isBaseAmountGreaterThan(requiredOfferBaseAmount, offerBalance));
  const quoteReady = quote.isSuccess && Boolean(quote.data) && !quote.isFetching && !quote.isError && !quote.isDebouncing;
  const priceImpact = quote.data && quote.data.source === "pair" ? getPriceImpact({ spreadAmount: quote.data.spread_amount, returnAmount: quote.data.return_amount }) : null;
  const requiresHighImpactConfirm = priceImpact?.severity === "high";
  const selectedRoute = quote.data?.route;
  const routeRisk = assessRouteRisk(selectedRoute);
  const minimumReceive = quote.data ? calculateMinimumReceived(quote.data.return_amount, slippageBps) : "0";
  useEffect(() => setHighImpactConfirmed(false), [quoteInputBaseAmount, quoteMode, offerAsset.id, askAsset.id, quote.data?.return_amount, quote.data?.spread_amount]);
  useEffect(() => setRiskAcknowledged(false), [quoteInputBaseAmount, quoteMode, offerAsset.id, askAsset.id, selectedRoute?.id]);

  const validationError = !activeParsedAmount.isValid
    ? activeParsedAmount.error
    : sameToken
      ? "Choose two different tokens"
      : !hasAmount
        ? "Enter amount"
        : quote.isDebouncing
          ? "Updating quote…"
          : exceedsBalance
            ? `Insufficient ${offerAsset.symbol} balance`
            : quote.isError
              ? "Route preview unavailable"
              : quote.isFetching || (hasAmount && !quoteReady)
                ? "Refreshing route…"
                : !selectedRoute
                  ? "No route found"
                  : requiresHighImpactConfirm && !highImpactConfirmed
                    ? "Confirm high price impact"
                    : routeRisk.requiresAcknowledgement && !riskAcknowledged
                      ? "Acknowledge unverified route"
                      : undefined;
  const submitDisabled = wallet.status !== "connected"
    || !network.isJunoReady
    || network.isWrongNetwork
    || Boolean(validationError)
    || swapTx.isPending;
  const actionCopy = network.isWrongNetwork
    ? "Switch to Juno to swap"
    : wallet.status === "connected" && !network.isJunoReady
      ? "Juno network required"
      : wallet.status !== "connected"
        ? "Connect wallet to swap"
        : swapTx.isPending
          ? "Swapping…"
          : validationError ?? (quoteMode === "exact-out" ? "Swap exact output" : "Swap");

  const updateOfferAmount = (nextAmount: string) => {
    setAmount(nextAmount);
    setQuoteMode("exact-in");
  };

  const updateAskAmount = (nextAmount: string) => {
    setAskAmount(nextAmount);
    setQuoteMode("exact-out");
  };

  const handleOfferChange = (next: string) => {
    setOfferId(next);
    if (next === askId) setAskId(selectableAssets.find((asset) => asset.id !== next)?.id ?? askId);
    setQuoteMode("exact-in");
  };

  const handleFlip = () => {
    const nextOfferAmount = quote.data?.return_amount ? formatAmount(quote.data.return_amount, askAsset.decimals) : askAmount;
    setOfferId(askAsset.id);
    setAskId(offerAsset.id);
    setAmount(nextOfferAmount || "");
    setAskAmount("");
    setQuoteMode("exact-in");
  };

  const handleSwap = () => {
    if (submitDisabled || !selectedRoute || !quote.data) return;
    swapTx.mutate({
      pool: selectedRoute.hops[0]?.pool,
      route: selectedRoute,
      offerAsset,
      askAsset,
      amount: requiredOfferBaseAmount,
      maxSpread: maxSpread || slippageBpsToMaxSpread(slippageBps),
      minimumReceive,
      source: quote.data.source,
    });
  };

  return (
    <Stack className="swap-card" direction="vertical" space="6">
      <Stack className="swap-card-header" direction="horizontal" align="center" justify="space-between" flexWrap="wrap">
        <Box>
          <Text as="h2" variant="heading">Swap</Text>
        </Box>
        <div className="swap-settings">
          <button
            className="icon-button slippage-icon-button"
            type="button"
            aria-label={`Slippage ${formattedSlippagePercent}%`}
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
            title={`Swap max_spread ${maxSpread}`}
          >
            <span className="slippage-icon" aria-hidden="true" />
          </button>
          {settingsOpen ? <SettingsPanel onClose={() => setSettingsOpen(false)} /> : null}
        </div>
      </Stack>
      <div className="swap-amount-stack">
        <Stack className="asset-amount-card" direction="vertical" space="4">
          <Stack className="form-grid" direction="horizontal" align="flex-end">
            <TokenAmountInput
              label="You pay"
              value={quoteMode === "exact-out" && quote.data ? formatAmount(quote.data.offer_amount, offerAsset.decimals) : amount}
              decimals={offerAsset.decimals}
              symbol={offerAsset.symbol}
              balanceBaseAmount={offerBalance}
              onChange={updateOfferAmount}
              fiatHint={quoteMode === "exact-out" && quote.data ? <span>Required input</span> : undefined}
              showQuickActions={false}
              showTokenIdentity={false}
            />
            <TokenSelect assets={selectableAssets} value={offerId} onChange={handleOfferChange} label="From asset" balances={balances.data} showIdentifier={false} hideLabel />
          </Stack>
        </Stack>
        <Button variant="outlined" intent="secondary" size="sm" className="swap-direction" onClick={handleFlip} domAttributes={{ type: "button", title: "Flip swap direction" }}>↓</Button>
        <Stack className="asset-amount-card receive-card" direction="vertical" space="4">
          <Stack className="form-grid" direction="horizontal" align="flex-end">
            <TokenAmountInput
              label="You receive"
              value={quoteMode === "exact-out" ? askAmount : quote.data ? formatAmount(quote.data.return_amount, askAsset.decimals) : ""}
              decimals={askAsset.decimals}
              symbol={askAsset.symbol}
              onChange={updateAskAmount}
              showQuickActions={false}
              showTokenIdentity={false}
            />
            <TokenSelect assets={selectableAssets.filter((asset) => asset.id !== offerAsset.id)} value={askAsset.id} onChange={(next) => { setAskId(next); setQuoteMode("exact-in"); }} label="To asset" balances={balances.data} showIdentifier={false} hideLabel />
          </Stack>
        </Stack>
      </div>
      <QuoteCard quote={quote.data} askAsset={askAsset} offerAsset={offerAsset} isLoading={quote.isFetching || quote.isDebouncing} error={quote.error} slippageBps={slippageBps} updatedAt={quote.quoteUpdatedAt} />
      {priceImpact?.severity === "warning" ? (
        <div className="price-impact-warning" role="status">Price impact is elevated at {formatBpsPercent(priceImpact.bps)}. Review size and pool liquidity before swapping.</div>
      ) : null}
      {requiresHighImpactConfirm ? (
        <label className="price-impact-warning price-impact-danger">
          <input type="checkbox" checked={highImpactConfirmed} onChange={(event) => setHighImpactConfirmed(event.target.checked)} />
          I understand this quote has high price impact ({formatBpsPercent(priceImpact.bps)}).
        </label>
      ) : null}
      <RiskAcknowledgement assessment={routeRisk} checked={riskAcknowledged} onChange={setRiskAcknowledged} action="swap route" />
      {network.isWrongNetwork ? <Text as="p" className="error-text">Transactions are blocked while your wallet is off Juno mainnet.</Text> : null}
      {validationError && wallet.status === "connected" && !network.isWrongNetwork ? <Text as="p" className="error-text">{validationError}</Text> : null}
      {swapTx.isError ? <Text as="p" className="error-text">{swapTx.error instanceof Error ? swapTx.error.message : "Swap failed"}</Text> : null}
      {swapTx.isSuccess ? <Text as="p" className="success-text">Swap transaction broadcast. Balances, route quote, and pool reserves are refreshing.</Text> : null}
      <TxStatusDialog state={swapTx.txState} />
      <Button intent="primary" className="primary-action" disabled={submitDisabled} fluidWidth onClick={handleSwap} domAttributes={{ type: "button" }}>{actionCopy}</Button>
    </Stack>
  );
}
