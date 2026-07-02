import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RegistryPool } from "../config/registry";
import { createProvideLiquidityMessage } from "../lib/astroport/messages";
import { resolveSigningClient, type SigningClientSource } from "../lib/cosmjs/clients";
import { invalidateDexTxQueries, useTxRunner } from "../tx/useTxRunner";

type ProvideLiquidityVariables = {
  pool: RegistryPool;
  amounts: [string, string];
  slippageTolerance?: string;
  minLpToReceive?: string;
};

export function useProvideLiquidityTx(signerOrClient: SigningClientSource, sender: string | undefined) {
  const queryClient = useQueryClient();
  const txRunner = useTxRunner();
  const mutation = useMutation({
    mutationFn: async (variables: ProvideLiquidityVariables) => {
      return txRunner.runTx({
        title: "Add liquidity",
        pendingMessage: `Providing liquidity to ${variables.pool.label}…`,
        variables,
        broadcast: async ({ pool, amounts, slippageTolerance, minLpToReceive }) => {
          const client = await resolveSigningClient(signerOrClient);
          if (!client || !sender) throw new Error("Connect a wallet before broadcasting");
          const { msg, funds } = createProvideLiquidityMessage(pool.assets, amounts, slippageTolerance, minLpToReceive);
          return client.execute(sender, pool.pair, msg, "auto", undefined, funds);
        },
        successMessage: (_result, { pool, amounts }) => `Liquidity transaction submitted for ${pool.label}: ${amounts[0]} / ${amounts[1]}.`,
        onSuccess: (_result, { pool }) => invalidateDexTxQueries(queryClient, sender, pool),
      });
    },
  });
  return { ...mutation, txState: txRunner.state, resetTx: txRunner.reset };
}
