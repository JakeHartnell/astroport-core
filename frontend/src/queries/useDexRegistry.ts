import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { dexRegistry, enabledPools } from "../config/registry";
import { queryFactoryPairs } from "../lib/astroport/queries";
import { mergeDiscoveredPools, queryAllFactoryPairs } from "../lib/astroport/poolDiscovery";

export function useDexRegistry() {
  const discovery = useQuery({
    queryKey: ["factory-pairs", dexRegistry.chainId, dexRegistry.factory],
    queryFn: () => queryAllFactoryPairs(queryFactoryPairs),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 2,
  });

  const pools = useMemo(
    () => discovery.data ? mergeDiscoveredPools(discovery.data, enabledPools) : enabledPools.map((pool) => ({ ...pool, source: "registry" as const, verified: true })),
    [discovery.data],
  );

  return { registry: dexRegistry, pools, discovery };
}
