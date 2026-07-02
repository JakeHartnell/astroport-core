import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { RegistryAsset, RegistryPool } from "../config/registry";
import { createSwapMessage } from "../lib/astroport/messages";
import { getSigningClient } from "../lib/cosmjs/clients";
import { invalidateDexTxQueries, useTxRunner } from "../tx/useTxRunner";

type SigningClientGetter = () => Promise<SigningCosmWasmClient>;

async function resolveSigningClient(signerOrClient: OfflineSigner | SigningClientGetter | undefined) {
  if (!signerOrClient) return undefined;
  if (typeof signerOrClient === "function") return signerOrClient();
  return getSigningClient(signerOrClient);
}

export function useSwapTx(signerOrClient: OfflineSigner | SigningClientGetter | undefined, sender: string | undefined) {
  const queryClient = useQueryClient();
  const txRunner = useTxRunner();
  const mutation = useMutation({
    mutationFn: async (variables: { pool: RegistryPool; offerAsset: RegistryAsset; askAsset: RegistryAsset; amount: string; maxSpread: string }) => {
      return txRunner.runTx({
        title: "Swap",
        pendingMessage: `Swapping ${variables.offerAsset.symbol} for ${variables.askAsset.symbol} on Juno…`,
        variables,
        broadcast: async ({ pool, offerAsset, askAsset, amount, maxSpread }) => {
          const client = await resolveSigningClient(signerOrClient);
          if (!client || !sender) throw new Error("Connect a wallet before broadcasting");
          const { msg, funds } = createSwapMessage(offerAsset, askAsset, amount, maxSpread);
          return client.execute(sender, pool.pair, msg, "auto", undefined, funds);
        },
        successMessage: (_result, { amount, offerAsset, askAsset }) => `Swap submitted: ${amount} ${offerAsset.symbol} → ${askAsset.symbol}.`,
        onSuccess: (_result, { pool }) => invalidateDexTxQueries(queryClient, sender, pool),
      });
    },
  });
  return { ...mutation, txState: txRunner.state, resetTx: txRunner.reset };
}
