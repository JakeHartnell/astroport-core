import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RegistryPool } from "../config/registry";
import { createClaimRewardsMessage, createStakeLpExecute, createUnstakeLpMessage, getIncentivesContractAddress } from "../lib/incentives";
import { resolveSigningClient, type SigningClientSource } from "../lib/cosmjs/clients";
import { invalidateDexTxQueries, useTxRunner } from "../tx/useTxRunner";

type IncentivesAction = "stake" | "unstake" | "claim";

type IncentivesVariables = {
  action: IncentivesAction;
  pool: RegistryPool;
  amount?: string;
};

export function useIncentivesTx(signerOrClient: SigningClientSource, sender: string | undefined) {
  const queryClient = useQueryClient();
  const txRunner = useTxRunner();
  const mutation = useMutation({
    mutationFn: async (variables: IncentivesVariables) => {
      return txRunner.runTx({
        title: incentivesActionTitle(variables.action),
        pendingMessage: `${incentivesActionTitle(variables.action)} for ${variables.pool.label}…`,
        variables,
        broadcast: async ({ action, pool, amount }) => {
          const incentivesAddress = getIncentivesContractAddress();
          if (!incentivesAddress) throw new Error("Incentives contract is not configured");
          const client = await resolveSigningClient(signerOrClient);
          if (!client || !sender) throw new Error("Connect a wallet before broadcasting");
          const { msg, funds } = buildIncentivesExecute(pool, action, amount);
          return client.execute(sender, incentivesAddress, msg as Record<string, unknown>, "auto", undefined, funds);
        },
        successMessage: (_result, { action, pool }) => `${incentivesActionTitle(action)} transaction submitted for ${pool.label}.`,
        onSuccess: (_result, { pool }) => {
          invalidateDexTxQueries(queryClient, sender, pool);
          void queryClient.invalidateQueries({ queryKey: ["incentives", pool.lpToken] });
        },
      });
    },
  });
  return { ...mutation, txState: txRunner.state, resetTx: txRunner.reset };
}

export function buildIncentivesExecute(pool: RegistryPool, action: IncentivesAction, amount?: string) {
  if (action === "stake") {
    if (!amount) throw new Error("Enter an LP amount to stake");
    return createStakeLpExecute(pool, amount);
  }
  if (action === "unstake") {
    if (!amount) throw new Error("Enter an LP amount to unstake");
    return { msg: createUnstakeLpMessage(pool, amount), funds: [] };
  }
  return { msg: createClaimRewardsMessage(pool), funds: [] };
}

function incentivesActionTitle(action: IncentivesAction) {
  if (action === "stake") return "Stake LP";
  if (action === "unstake") return "Unstake LP";
  return "Claim rewards";
}
