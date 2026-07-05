import type { RegistryPool } from "../../config/registry";
import type { PoolResponse } from "../generated/Pair.types";
import type { Asset } from "../generated/Incentives.types";
import type { IncentivesPoolState } from "../incentives";
import type { IndexerAssetAmount, IndexerPoolPosition } from "../indexer/types";
import { estimateLpPosition } from "../liquidity/position";
import type { WalletBalance } from "../../queries/useWalletBalances";

export type PortfolioAssetAmount = {
  denom: string;
  symbol: string;
  amount: string;
  decimals: number;
  valueUsd: number | null;
  valueJuno: number | null;
  priceStatus: "fresh" | "stale" | "missing" | "unknown" | string;
  priceSource?: string | null;
};

export type PortfolioReward = {
  denom: string;
  symbol: string;
  amount: string;
  valueUsd: number | null;
  valueJuno: number | null;
  status: "claimable" | "unavailable";
};

export type PortfolioPosition = {
  id: string;
  pool: RegistryPool;
  source: "indexer" | "mock" | "on-chain";
  isStale: boolean;
  lpBalance: string;
  stakedLpBalance: string | null;
  shareBps: number;
  valueUsd: number | null;
  valueJuno: number | null;
  assets: PortfolioAssetAmount[];
  rewards: PortfolioReward[];
};

export type PortfolioSummary = {
  positions: PortfolioPosition[];
  walletBalances: WalletBalance[];
  totalLpValueUsd: number | null;
  totalLpValueJuno: number | null;
  totalClaimableUsd: number | null;
  totalClaimableJuno: number | null;
  missingPositionPrices: number;
  missingRewardPrices: number;
  claimableRewardCount: number;
};

type IndexerPositionWithOptionalRewards = IndexerPoolPosition & {
  stakedLpBalance?: string | null;
  staked_balance?: string | null;
  bondedBalance?: string | null;
  bonded_balance?: string | null;
  rewards?: IndexerAssetAmount[];
  claimableRewards?: IndexerAssetAmount[];
  claimable_rewards?: IndexerAssetAmount[];
};

function baseAmount(value: string | undefined | null) {
  if (!value || !/^\d+$/.test(value)) return 0n;
  return BigInt(value);
}

function sumBaseAmounts(...values: Array<string | undefined | null>) {
  return values.reduce((total, value) => total + baseAmount(value), 0n).toString();
}

function findPoolForPosition(position: IndexerPoolPosition, pools: RegistryPool[]) {
  return pools.find((pool) => pool.pair === position.pairAddress || pool.id === position.poolId || pool.lpToken === position.lpToken);
}

function denomFromAssetInfo(info: Asset["info"]) {
  if ("native_token" in info) return info.native_token.denom;
  return info.token.contract_addr;
}

function rewardFromIncentives(asset: Asset, pool: RegistryPool): PortfolioReward {
  const denom = denomFromAssetInfo(asset.info);
  const registryAsset = pool.assets.find((candidate) => candidate.id === denom);
  const isJuno = denom === "ujuno";
  const junoValue = Number(asset.amount) / 1_000_000;
  return {
    denom,
    symbol: registryAsset?.symbol ?? (isJuno ? "JUNO" : denom),
    amount: asset.amount,
    valueUsd: null,
    valueJuno: isJuno && Number.isFinite(junoValue) ? junoValue : null,
    status: baseAmount(asset.amount) > 0n ? "claimable" : "unavailable",
  };
}

function assetFromIndexer(asset: IndexerAssetAmount, pool: RegistryPool, index: number): PortfolioAssetAmount {
  const registryAsset = pool.assets.find((candidate) => candidate.id === asset.denom) ?? pool.assets[index];
  return {
    denom: asset.denom,
    symbol: asset.symbol ?? registryAsset?.symbol ?? asset.denom,
    amount: asset.amount ?? "0",
    decimals: registryAsset?.decimals ?? 6,
    valueUsd: typeof asset.valueUsd === "number" ? asset.valueUsd : null,
    valueJuno: typeof asset.valueJuno === "number" ? asset.valueJuno : null,
    priceStatus: asset.priceStatus ?? (typeof asset.priceUsd === "number" ? "fresh" : "missing"),
    priceSource: asset.priceSource,
  };
}

function rewardFromIndexer(asset: IndexerAssetAmount, pool: RegistryPool): PortfolioReward {
  const registryAsset = pool.assets.find((candidate) => candidate.id === asset.denom);
  return {
    denom: asset.denom,
    symbol: asset.symbol ?? registryAsset?.symbol ?? asset.denom,
    amount: asset.amount ?? "0",
    valueUsd: typeof asset.valueUsd === "number" ? asset.valueUsd : null,
    valueJuno: typeof asset.valueJuno === "number" ? asset.valueJuno : null,
    status: baseAmount(asset.amount) > 0n ? "claimable" : "unavailable",
  };
}

function positionFromIndexer(position: IndexerPositionWithOptionalRewards, pools: RegistryPool[]): PortfolioPosition | undefined {
  const pool = findPoolForPosition(position, pools);
  if (!pool) return undefined;
  const rewards = (position.claimableRewards ?? position.claimable_rewards ?? position.rewards ?? []).map((reward) => rewardFromIndexer(reward, pool));
  const stakedLpBalance = position.stakedLpBalance ?? position.staked_balance ?? position.bondedBalance ?? position.bonded_balance ?? null;
  return {
    id: pool.id,
    pool,
    source: position.isMock || position.dataSource === "mock" ? "mock" : "indexer",
    isStale: false,
    lpBalance: position.lpBalance,
    stakedLpBalance,
    shareBps: position.shareBps,
    valueUsd: typeof position.valueUsd === "number" ? position.valueUsd : null,
    valueJuno: typeof position.valueJuno === "number" ? position.valueJuno : null,
    assets: position.assets.map((asset, index) => assetFromIndexer(asset, pool, index)),
    rewards,
  };
}

function positionWithIncentives(position: PortfolioPosition, incentives: IncentivesPoolState | undefined): PortfolioPosition {
  if (!incentives) return position;
  const pendingRewards = incentives.pendingRewards.map((reward) => rewardFromIncentives(reward, position.pool));
  const rewards = position.rewards.length > 0 ? position.rewards : pendingRewards;
  return {
    ...position,
    stakedLpBalance: position.stakedLpBalance ?? incentives.stakedAmount ?? null,
    rewards,
  };
}

function positionFromFallback(pool: RegistryPool, balances: readonly WalletBalance[], reserve: PoolResponse | undefined): PortfolioPosition | undefined {
  const lpBalance = balances.find((balance) => balance.denom === pool.lpToken)?.amount ?? "0";
  const estimate = estimateLpPosition(reserve, lpBalance);
  if (!estimate.hasPosition) return undefined;
  return {
    id: pool.id,
    pool,
    source: "on-chain",
    isStale: false,
    lpBalance: estimate.lpBalance,
    stakedLpBalance: null,
    shareBps: estimate.shareBps,
    valueUsd: null,
    valueJuno: null,
    assets: pool.assets.map((asset, index) => ({
      denom: asset.id,
      symbol: asset.symbol,
      amount: estimate.underlyingAssets[index]?.amount ?? "0",
      decimals: asset.decimals,
      valueUsd: null,
      valueJuno: null,
      priceStatus: "missing",
    })),
    rewards: [],
  };
}

export function buildPortfolioSummary(input: {
  pools: RegistryPool[];
  balances?: readonly WalletBalance[];
  reservesByPair?: Record<string, PoolResponse | undefined>;
  indexerPositions?: IndexerPositionWithOptionalRewards[];
  incentivesByLpToken?: Record<string, IncentivesPoolState | undefined>;
  preferIndexer?: boolean;
}): PortfolioSummary {
  const balances = [...(input.balances ?? [])];
  const positionsById = new Map<string, PortfolioPosition>();

  if (input.preferIndexer) {
    for (const position of input.indexerPositions ?? []) {
      const normalized = positionFromIndexer(position, input.pools);
      if (normalized) positionsById.set(normalized.id, positionWithIncentives(normalized, input.incentivesByLpToken?.[normalized.pool.lpToken]));
    }
  }

  for (const pool of input.pools) {
    if (positionsById.has(pool.id)) continue;
    const fallback = positionFromFallback(pool, balances, input.reservesByPair?.[pool.pair]);
    if (fallback) positionsById.set(pool.id, positionWithIncentives(fallback, input.incentivesByLpToken?.[pool.lpToken]));
  }

  const positions = Array.from(positionsById.values()).sort((a, b) => a.pool.label.localeCompare(b.pool.label));
  const knownPositionValues = positions.filter((position) => typeof position.valueUsd === "number");
  const knownPositionMarketValues = positions.filter((position) => typeof position.valueUsd === "number" || typeof position.valueJuno === "number");
  const knownPositionJunoValues = positions.filter((position) => typeof position.valueJuno === "number");
  const rewardRows = positions.flatMap((position) => position.rewards).filter((reward) => reward.status === "claimable");
  const knownRewardValues = rewardRows.filter((reward) => typeof reward.valueUsd === "number");
  const knownRewardMarketValues = rewardRows.filter((reward) => typeof reward.valueUsd === "number" || typeof reward.valueJuno === "number");
  const knownRewardJunoValues = rewardRows.filter((reward) => typeof reward.valueJuno === "number");
  return {
    positions,
    walletBalances: balances,
    totalLpValueUsd: knownPositionValues.length === positions.length && positions.length > 0 ? knownPositionValues.reduce((sum, position) => sum + (position.valueUsd ?? 0), 0) : null,
    totalLpValueJuno: knownPositionJunoValues.length === positions.length && positions.length > 0 ? knownPositionJunoValues.reduce((sum, position) => sum + (position.valueJuno ?? 0), 0) : null,
    totalClaimableUsd: rewardRows.length > 0 && knownRewardValues.length === rewardRows.length ? knownRewardValues.reduce((sum, reward) => sum + (reward.valueUsd ?? 0), 0) : null,
    totalClaimableJuno: rewardRows.length > 0 && knownRewardJunoValues.length === rewardRows.length ? knownRewardJunoValues.reduce((sum, reward) => sum + (reward.valueJuno ?? 0), 0) : null,
    missingPositionPrices: positions.length - knownPositionMarketValues.length,
    missingRewardPrices: rewardRows.length - knownRewardMarketValues.length,
    claimableRewardCount: rewardRows.length,
  };
}

export function totalLpBalance(position: PortfolioPosition) {
  return sumBaseAmounts(position.lpBalance, position.stakedLpBalance);
}
