import { useQuery } from "@tanstack/react-query";
import type { RegistryPool } from "../config/registry";
import { queryIncentivesPoolState } from "../lib/incentives";

export function useIncentivesPool(pool: RegistryPool | undefined, walletAddress: string | undefined) {
  return useQuery({
    queryKey: ["incentives", pool?.lpToken, walletAddress],
    enabled: Boolean(pool),
    staleTime: 20_000,
    retry: false,
    queryFn: async () => {
      if (!pool) throw new Error("pool is required");
      return queryIncentivesPoolState(pool, walletAddress);
    },
  });
}
