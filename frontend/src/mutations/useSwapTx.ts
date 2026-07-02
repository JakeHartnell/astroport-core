import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RegistryAsset, RegistryPool } from "../config/registry";
import { dexRegistry } from "../config/registry";
import { createSwapMessage } from "../lib/astroport/messages";
import { createRouterSwapMessage, type SwapRoute } from "../lib/astroport/routes";
import { resolveSigningClient, type SigningClientSource } from "../lib/cosmjs/clients";
import { invalidateDexTxQueries, type TxResult, useTxRunner } from "../tx/useTxRunner";

type SwapTxVariables = {
  pool?: RegistryPool;
  route: SwapRoute;
  offerAsset: RegistryAsset;
  askAsset: RegistryAsset;
  amount: string;
  maxSpread: string;
  minimumReceive: string;
  source: "pair" | "router";
};

export function useSwapTx(signerOrClient: SigningClientSource, sender: string | undefined) {
  const queryClient = useQueryClient();
  const txRunner = useTxRunner();
  const mutation = useMutation<TxResult, Error, SwapTxVariables>({
    mutationFn: async (variables: SwapTxVariables) => {
      return txRunner.runTx({
        title: "Swap",
        pendingMessage: `Swapping ${variables.offerAsset.symbol} for ${variables.askAsset.symbol} on Juno…`,
        variables,
        broadcast: async ({ pool, route, offerAsset, askAsset, amount, maxSpread, minimumReceive, source }) => {
          const client = await resolveSigningClient(signerOrClient);
          if (!client || !sender) throw new Error("Connect a wallet before broadcasting");
          if (source === "pair") {
            const directPool = pool ?? route.hops[0]?.pool;
            if (!directPool) throw new Error("Direct swap route is missing its pair contract");
            const { msg, funds } = createSwapMessage(offerAsset, askAsset, amount, maxSpread);
            return client.execute(sender, directPool.pair, msg, "auto", undefined, funds);
          }

          if (!dexRegistry.router) throw new Error("Router contract is not configured");
          const { msg, funds } = createRouterSwapMessage(route, offerAsset, amount, maxSpread, minimumReceive);
          return client.execute(sender, dexRegistry.router, msg, "auto", undefined, funds);
        },
        successMessage: (_result, { amount, offerAsset, askAsset }) => `Swap submitted: ${amount} ${offerAsset.symbol} → ${askAsset.symbol}.`,
        onSuccess: (_result, { pool, route }) => invalidateDexTxQueries(queryClient, sender, pool ?? route.hops[0]?.pool),
      });
    },
  });
  return { ...mutation, txState: txRunner.state, resetTx: txRunner.reset };
}
