import { useEffect, useMemo, useState } from "react";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { Box, Button, Stack, Text } from "@interchain-ui/react";
import type { RegistryPool } from "../../config/registry";
import { formatAmount, isBaseAmountGreaterThan, parseTokenAmount } from "../../lib/format/amounts";
import { formatBpsPercent, getPriceImpact, slippageBpsToMaxSpread } from "../../lib/swap/slippage";
import { useSwapTx } from "../../mutations/useSwapTx";
import { useSwapQuote } from "../../queries/useSwapQuote";
import { getWalletBalanceAmount, useWalletBalances } from "../../queries/useWalletBalances";
import { useSlippageSettings } from "../../settings/SlippageSettingsContext";
import { useNetworkGuard, useWallet } from "../../wallet/WalletContext";
import { TokenAmountInput } from "../common";
import { TxStatusDialog } from "../tx/TxStatusDialog";
import { QuoteCard } from "./QuoteCard";
import { TokenSelect } from "./TokenSelect";

type SigningClientGetter = () => Promise<SigningCosmWasmClient>;

function isPositiveBaseAmount(amount: string) {
  return /^\d+$/.test(amount) && BigInt(amount) > 0n;
}

export function SwapForm({ pool }: { pool: RegistryPool }) {
  const { wallet } = useWallet();
  const { network } = useNetworkGuard();
  const [offerId, setOfferId] = useState(pool.assets[0].id);
  const [amount, setAmount] = useState("1");
  const [highImpactConfirmed, setHighImpactConfirmed] = useState(false);
  const { slippageBps, formattedSlippagePercent, maxSpread } = useSlippageSettings();
  const offerAsset = pool.assets.find((asset) => asset.id === offerId) ?? pool.assets[0];
  const askAsset = useMemo(() => pool.assets.find((asset) => asset.id !== offerAsset.id) ?? pool.assets[1], [offerAsset.id, pool.assets]);
  const parsedAmount = parseTokenAmount(amount, offerAsset.decimals);
  const baseAmount = parsedAmount.baseAmount;
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const balances = useWalletBalances(walletAddress, [pool]);
  const offerBalance = getWalletBalanceAmount(balances.data, offerAsset.id);
  const quote = useSwapQuote(pool, offerAsset, askAsset, baseAmount);
  const signerOrClient = wallet.status === "connected"
    ? (wallet.getSigningCosmWasmClient as SigningClientGetter | undefined) ?? (wallet.signer as OfflineSigner | undefined)
    : undefined;
  const swapTx = useSwapTx(signerOrClient, walletAddress);
  const hasAmount = parsedAmount.isValid && isPositiveBaseAmount(baseAmount);
  const exceedsBalance = Boolean(offerBalance && parsedAmount.isValid && isBaseAmountGreaterThan(baseAmount, offerBalance));
  const quoteReady = quote.isSuccess && Boolean(quote.data) && !quote.isFetching && !quote.isError;
  const receiveAmount = quote.data ? `${formatAmount(quote.data.return_amount, askAsset.decimals)} ${askAsset.symbol}` : "—";
  const priceImpact = quote.data ? getPriceImpact({ spreadAmount: quote.data.spread_amount, returnAmount: quote.data.return_amount }) : null;
  const requiresHighImpactConfirm = priceImpact?.severity === "high";
  useEffect(() => setHighImpactConfirmed(false), [baseAmount, offerAsset.id, askAsset.id, quote.data?.return_amount, quote.data?.spread_amount]);

  const validationError = !parsedAmount.isValid
    ? parsedAmount.error
    : !hasAmount
      ? "Enter amount"
      : exceedsBalance
        ? `Insufficient ${offerAsset.symbol} balance`
        : quote.isError
          ? "Quote unavailable"
          : quote.isFetching || (hasAmount && !quoteReady)
            ? "Refreshing quote…"
            : requiresHighImpactConfirm && !highImpactConfirmed
              ? "Confirm high price impact"
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
          : validationError ?? "Swap";

  const handleSwap = () => {
    if (submitDisabled) return;
    swapTx.mutate({ pool, offerAsset, askAsset, amount: baseAmount, maxSpread: maxSpread || slippageBpsToMaxSpread(slippageBps) });
  };

  return (
    <Stack className="swap-card" direction="vertical" space="6">
      <Stack className="swap-card-header" direction="horizontal" align="center" justify="space-between" flexWrap="wrap">
        <Box>
          <Text as="p" className="eyebrow">Direct swap</Text>
          <Text as="h2" variant="heading">{pool.assets[0].symbol} ↔ {pool.assets[1].symbol}</Text>
        </Box>
        <Button variant="outlined" intent="secondary" size="sm" className="slippage-pill" domAttributes={{ type: "button", title: `Swap max_spread ${maxSpread}` }}>Slippage {formattedSlippagePercent}%</Button>
      </Stack>
      <Box className="mode-tabs" aria-label="Trade mode">
        <span className="mode-tab active">Direct pair</span>
        <span className="mode-tab disabled" title="Router execution is not enabled for direct-pair v1">Router later</span>
      </Box>
      <Stack className="asset-amount-card" direction="vertical" space="4">
        <Stack className="asset-card-topline" direction="horizontal" justify="space-between"><span>From</span><strong>{offerAsset.symbol}</strong></Stack>
        <Stack className="form-grid" direction="horizontal" align="flex-end">
          <TokenAmountInput
            label="Amount"
            value={amount}
            decimals={offerAsset.decimals}
            symbol={offerAsset.symbol}
            balanceBaseAmount={offerBalance}
            onChange={(nextAmount) => setAmount(nextAmount)}
            fiatHint={<span>USD hint pending oracle wiring</span>}
          />
          <TokenSelect assets={pool.assets} value={offerId} onChange={setOfferId} label="Asset" />
        </Stack>
        <code>{offerAsset.id}</code>
      </Stack>
      <Box className="swap-direction">↓</Box>
      <Stack className="asset-amount-card receive-card" direction="vertical" space="4">
        <Stack className="asset-card-topline" direction="horizontal" justify="space-between"><span>To · estimated receive</span><strong>{askAsset.symbol}</strong></Stack>
        <Text as="div" className="estimated-receive">{receiveAmount}</Text>
        <code>{askAsset.id}</code>
      </Stack>
      <QuoteCard quote={quote.data} askAsset={askAsset} isLoading={quote.isFetching} error={quote.error} pool={pool} slippageBps={slippageBps} />
      {priceImpact?.severity === "warning" ? (
        <div className="price-impact-warning" role="status">Price impact is elevated at {formatBpsPercent(priceImpact.bps)}. Review size and pool liquidity before swapping.</div>
      ) : null}
      {requiresHighImpactConfirm ? (
        <label className="price-impact-warning price-impact-danger">
          <input type="checkbox" checked={highImpactConfirmed} onChange={(event) => setHighImpactConfirmed(event.target.checked)} />
          I understand this quote has high price impact ({formatBpsPercent(priceImpact.bps)}).
        </label>
      ) : null}
      {network.isWrongNetwork ? <Text as="p" className="error-text">Transactions are blocked while your wallet is off Juno mainnet.</Text> : null}
      {validationError && wallet.status === "connected" && !network.isWrongNetwork ? <Text as="p" className="error-text">{validationError}</Text> : null}
      {swapTx.isError ? <Text as="p" className="error-text">{swapTx.error instanceof Error ? swapTx.error.message : "Swap failed"}</Text> : null}
      {swapTx.isSuccess ? <Text as="p" className="success-text">Swap transaction broadcast. Balances, quote, and pool reserves are refreshing.</Text> : null}
      <Box className="empty-state compact">
        <strong>Experimental thin-liquidity pool</strong>
        <p>Direct swaps execute against the live pair. Review price impact, fees, and slippage before signing; this test market can move sharply.</p>
      </Box>
      <TxStatusDialog state={swapTx.txState} />
      <Button intent="primary" className="primary-action" disabled={submitDisabled} fluidWidth onClick={handleSwap} domAttributes={{ type: "button" }}>{actionCopy}</Button>
    </Stack>
  );
}
