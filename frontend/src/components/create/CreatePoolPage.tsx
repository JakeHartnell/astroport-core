import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Button, Stack, Text } from "@interchain-ui/react";
import type { RegistryAsset } from "../../config/registry";
import { dexRegistry } from "../../config/registry";
import { toAssetInfo } from "../../lib/astroport/assetInfo";
import { queryFactoryConfig, queryFactoryPair } from "../../lib/astroport/queries";
import { buildCreatePoolAssets, createPoolOptions, makeCustomAsset, poolMatchesAssets, validateCreatePool, type CreatePoolType } from "../../lib/createPool";
import { useCreatePoolTx } from "../../mutations/useCreatePoolTx";
import { useDexRegistry } from "../../queries/useDexRegistry";
import { useNetworkGuard, useWallet } from "../../wallet/WalletContext";
import { EmptyState, ErrorState, RiskAcknowledgement, Skeleton } from "../common";
import { TxStatusDialog } from "../tx/TxStatusDialog";
import { TokenSelect } from "../swap/TokenSelect";

type AssetSide = "a" | "b";

function feeLabel(feeBps?: number) {
  return typeof feeBps === "number" ? `${(feeBps / 100).toFixed(2)}% total fee` : "Factory default fee";
}

function inferCustomAssetKind(id: string): RegistryAsset["kind"] {
  if (/^juno1[0-9a-z]+$/i.test(id)) return "cw20";
  if (/^ibc\//i.test(id)) return "ibc";
  return "native";
}

export function CreatePoolPage() {
  const navigate = useNavigate();
  const { pools } = useDexRegistry();
  const { wallet } = useWallet();
  const { network } = useNetworkGuard();
  const [poolType, setPoolType] = useState<CreatePoolType>("xyk");
  const [assetAId, setAssetAId] = useState("ujuno");
  const [assetBId, setAssetBId] = useState("");
  const [customAssets, setCustomAssets] = useState<Partial<Record<AssetSide, RegistryAsset>>>({});
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const configQuery = useQuery({ queryKey: ["factory-config", dexRegistry.factory], queryFn: queryFactoryConfig, staleTime: 5 * 60_000, retry: 2 });
  const options = useMemo(() => createPoolOptions(configQuery.data?.pair_configs), [configQuery.data?.pair_configs]);
  const selectedOption = options.find((option) => option.id === poolType) ?? options[0];
  const baseAssets = useMemo(() => buildCreatePoolAssets(pools), [pools]);
  const selectableAssets = useMemo(() => {
    const custom = [customAssets.a, customAssets.b].filter((asset): asset is RegistryAsset => Boolean(asset));
    const customIds = new Set(custom.map((asset) => asset.id));
    return [...custom, ...baseAssets.filter((asset) => !customIds.has(asset.id))];
  }, [baseAssets, customAssets]);

  useEffect(() => {
    if (!assetBId) setAssetBId(selectableAssets.find((asset) => asset.id !== assetAId)?.id ?? "");
  }, [assetAId, assetBId, selectableAssets]);

  useEffect(() => setRiskAcknowledged(false), [assetAId, assetBId, poolType]);

  const assetA = selectableAssets.find((asset) => asset.id === assetAId);
  const assetB = selectableAssets.find((asset) => asset.id === assetBId && asset.id !== assetAId);
  const selectedAssets = assetA && assetB ? [assetA, assetB] as [RegistryAsset, RegistryAsset] : undefined;
  const localDuplicate = selectedAssets ? pools.find((pool) => poolMatchesAssets(pool, selectedAssets)) : undefined;
  const duplicateQuery = useQuery({
    queryKey: ["factory-pair", selectedAssets?.[0].id, selectedAssets?.[1].id],
    enabled: Boolean(selectedAssets && !localDuplicate),
    queryFn: async () => {
      if (!selectedAssets) return null;
      try {
        return await queryFactoryPair([toAssetInfo(selectedAssets[0]), toAssetInfo(selectedAssets[1])]);
      } catch (error) {
        if (error instanceof Error && /404|not found|No pair|Pair was not found/i.test(error.message)) return null;
        throw error;
      }
    },
    retry: 1,
    staleTime: 30_000,
  });
  const validation = validateCreatePool({ assets: [assetA, assetB], option: selectedOption, existingPair: localDuplicate ?? duplicateQuery.data, riskAcknowledged });
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const signerOrClient = wallet.status === "connected" ? wallet.signer : undefined;
  const createPoolTx = useCreatePoolTx(signerOrClient, walletAddress);
  const submitDisabled = wallet.status !== "connected" || !network.isJunoReady || network.isWrongNetwork || configQuery.isError || duplicateQuery.isError || !validation.isValid || createPoolTx.isPending;
  const actionCopy = network.isWrongNetwork
    ? "Switch to Juno to create pool"
    : wallet.status !== "connected"
      ? "Connect wallet to create pool"
      : createPoolTx.isPending
        ? "Creating pool…"
        : validation.error ?? "Create pool";

  const handleCreateCustomAsset = (side: AssetSide, query: string) => {
    const id = query.trim();
    if (!id) return;
    const asset = makeCustomAsset({ kind: inferCustomAssetKind(id), id });
    setCustomAssets((current) => ({ ...current, [side]: asset }));
    if (side === "a") setAssetAId(asset.id);
    else setAssetBId(asset.id);
  };

  const handleCreate = () => {
    if (submitDisabled || !selectedAssets || !selectedOption) return;
    createPoolTx.mutate({ assets: selectedAssets, option: selectedOption }, {
      onSuccess: (result) => {
        if (result.pairAddress) navigate(`/pools/${result.pairAddress}`);
      },
    });
  };

  return (
    <section className="panel-page create-pool-page" aria-labelledby="create-pool-title">
      <p className="eyebrow">Create pool</p>
      <h2 id="create-pool-title">Permissionless pool</h2>
      <p>Select two verified or custom assets, choose an available pool type, review risk guardrails, then broadcast <code>create_pair</code> on Juno.</p>

      <Stack className="swap-card" direction="vertical" space="6">
        <Stack className="swap-card-header" direction="horizontal" align="center" justify="space-between" flexWrap="wrap">
          <Box>
            <Text as="p" className="eyebrow">1 · Assets</Text>
            <Text as="h2" variant="heading">Select pair assets</Text>
          </Box>
        </Stack>
        <Stack className="form-grid" direction="horizontal" align="flex-end">
          <TokenSelect assets={selectableAssets} value={assetA?.id ?? ""} onChange={setAssetAId} label="First asset" disabledIds={assetB ? [assetB.id] : []} onCreateCustomAsset={(query) => handleCreateCustomAsset("a", query)} />
          <TokenSelect assets={selectableAssets.filter((asset) => asset.id !== assetA?.id)} value={assetB?.id ?? ""} onChange={setAssetBId} label="Second asset" onCreateCustomAsset={(query) => handleCreateCustomAsset("b", query)} />
        </Stack>

        <Box>
          <Text as="p" className="eyebrow">2 · Pool type</Text>
          {configQuery.isLoading ? <div className="lp-position-skeleton" aria-label="Loading factory config"><Skeleton width="16rem" /><Skeleton width="24rem" /></div> : null}
          {configQuery.isError ? <ErrorState title="Factory config unavailable" error="Pool type availability cannot be verified, so pool creation stays disabled until the factory config query succeeds." onRetry={() => void configQuery.refetch()} /> : null}
          {!configQuery.isLoading && options.length === 0 ? <EmptyState title="No factory pool types available">The factory returned no enabled create_pair configs. No default pool type is assumed.</EmptyState> : null}
          <div className="create-pool-type-grid" role="radiogroup" aria-label="Pool type">
            {options.map((option) => (
              <label className={`metric-card create-pool-type${option.id === poolType ? " active" : ""}${option.disabled ? " disabled" : ""}`} key={option.id}>
                <input type="radio" name="pool-type" value={option.id} checked={option.id === poolType} onChange={() => setPoolType(option.id)} />
                <span className="create-pool-type-radio" aria-hidden="true" />
                <span className="create-pool-type-copy">
                  <strong>{option.label}</strong>
                  <span>{feeLabel(option.feeBps)}</span>
                  {option.unsupportedReason ? <small className="error-text">{option.unsupportedReason}</small> : <small>Factory configured for permissionless create_pair.</small>}
                </span>
              </label>
            ))}
          </div>
        </Box>

        {localDuplicate ? <div className="empty-state"><strong>Existing pool detected.</strong> <a href={`/pools/${localDuplicate.pair}`}>Open {localDuplicate.label}</a> instead of creating a duplicate.</div> : null}
        {duplicateQuery.isFetching ? <p>Checking factory for an existing pair…</p> : null}
        <div className="empty-state compact create-guardrails"><strong>Guardrails</strong><ul>{validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>
        <RiskAcknowledgement assessment={validation.risk} checked={riskAcknowledged} onChange={setRiskAcknowledged} action="pool creation" />
        {network.isWrongNetwork ? <Text as="p" className="error-text">Transactions are blocked while your wallet is off Juno mainnet.</Text> : null}
        {validation.error && wallet.status === "connected" && !network.isWrongNetwork ? <Text as="p" className="error-text">{validation.error}</Text> : null}
        {createPoolTx.isError ? <Text as="p" className="error-text">{createPoolTx.error instanceof Error ? createPoolTx.error.message : "Create pool failed"}</Text> : null}
        {createPoolTx.isSuccess ? <Text as="p" className="success-text">Create pool transaction broadcast. Factory pools are refreshing.</Text> : null}
        <TxStatusDialog state={createPoolTx.txState} />
        <Button intent="primary" className="primary-action" disabled={submitDisabled} fluidWidth onClick={handleCreate} domAttributes={{ type: "button" }}>{actionCopy}</Button>
      </Stack>
    </section>
  );
}
