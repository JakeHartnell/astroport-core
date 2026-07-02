import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Coin } from "@cosmjs/stargate";
import type { RegistryPool } from "../config/registry";
import type { Asset } from "../lib/generated/Pair.types";
import { createWithdrawLiquidityMessage } from "../lib/astroport/messages";
import { resolveSigningClient, type SigningClientSource } from "../lib/cosmjs/clients";
import { invalidateDexTxQueries, useTxRunner } from "../tx/useTxRunner";

type WithdrawLiquidityVariables = {
  pool: RegistryPool;
  lpAmount: string;
  minAssetsToReceive?: Asset[];
};

export function useWithdrawLiquidityTx(signerOrClient: SigningClientSource, sender: string | undefined) {
  const queryClient = useQueryClient();
  const txRunner = useTxRunner();
  const mutation = useMutation({
    mutationFn: async (variables: WithdrawLiquidityVariables) => {
      return txRunner.runTx({
        title: "Remove liquidity",
        pendingMessage: `Withdrawing liquidity from ${variables.pool.label}…`,
        variables,
        broadcast: async ({ pool, lpAmount, minAssetsToReceive }) => {
          const client = await resolveSigningClient(signerOrClient);
          if (!client || !sender) throw new Error("Connect a wallet before broadcasting");
          const funds: Coin[] = [{ denom: pool.lpToken, amount: lpAmount }];
          return client.execute(sender, pool.pair, createWithdrawLiquidityMessage(minAssetsToReceive), "auto", undefined, funds);
        },
        successMessage: (_result, { pool, lpAmount }) => `Withdrawal transaction submitted for ${pool.label}: ${lpAmount} LP tokens.`,
        onSuccess: (_result, { pool }) => invalidateDexTxQueries(queryClient, sender, pool),
      });
    },
  });
  return { ...mutation, txState: txRunner.state, resetTx: txRunner.reset };
}
