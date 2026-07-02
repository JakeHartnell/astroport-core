import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { RegistryPool } from "../config/registry";
import { createProvideLiquidityMessage } from "../lib/astroport/messages";
import { getSigningClient } from "../lib/cosmjs/clients";
import { invalidateDexTxQueries, useTxRunner } from "../tx/useTxRunner";

type SigningClientGetter = () => Promise<SigningCosmWasmClient>;

async function resolveSigningClient(signerOrClient: OfflineSigner | SigningClientGetter | undefined) {
  if (!signerOrClient) return undefined;
  if (typeof signerOrClient === "function") return signerOrClient();
  return getSigningClient(signerOrClient);
}

export function useProvideLiquidityTx(signerOrClient: OfflineSigner | SigningClientGetter | undefined, sender: string | undefined) {
  const queryClient = useQueryClient();
  const txRunner = useTxRunner();
  const mutation = useMutation({
    mutationFn: async (variables: { pool: RegistryPool; amounts: [string, string] }) => {
      return txRunner.runTx({
        title: "Add liquidity",
        pendingMessage: `Providing liquidity to ${variables.pool.label}…`,
        variables,
        broadcast: async ({ pool, amounts }) => {
          const client = await resolveSigningClient(signerOrClient);
          if (!client || !sender) throw new Error("Connect a wallet before broadcasting");
          const { msg, funds } = createProvideLiquidityMessage(pool.assets, amounts);
          return client.execute(sender, pool.pair, msg, "auto", undefined, funds);
        },
        successMessage: (_result, { pool, amounts }) => `Liquidity transaction submitted for ${pool.label}: ${amounts[0]} / ${amounts[1]}.`,
        onSuccess: (_result, { pool }) => invalidateDexTxQueries(queryClient, sender, pool),
      });
    },
  });
  return { ...mutation, txState: txRunner.state, resetTx: txRunner.reset };
}
