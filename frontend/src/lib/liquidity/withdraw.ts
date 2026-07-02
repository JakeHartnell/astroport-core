import type { Asset, PoolResponse } from "../generated/Pair.types";

const BPS_DENOMINATOR = 10_000n;

function normalizeBaseAmount(amount: string | number | bigint | undefined): bigint {
  if (amount === undefined || amount === null) return 0n;
  const raw = String(amount).trim();
  if (!/^\d+$/.test(raw)) return 0n;
  return BigInt(raw);
}

export function calculatePercentageFill(balanceBaseAmount: string | undefined, percent: number): string {
  const balance = normalizeBaseAmount(balanceBaseAmount);
  if (balance <= 0n || !Number.isFinite(percent) || percent <= 0) return "0";
  const boundedPercent = Math.min(100, Math.max(0, Math.round(percent)));
  return ((balance * BigInt(boundedPercent)) / 100n).toString();
}

export function estimateWithdrawAssets(pool: PoolResponse | undefined, lpAmount: string): Asset[] {
  const share = normalizeBaseAmount(lpAmount);
  const totalShare = normalizeBaseAmount(pool?.total_share);
  if (!pool || share <= 0n || totalShare <= 0n) return [];

  return pool.assets.map((asset) => ({
    info: asset.info,
    amount: ((normalizeBaseAmount(asset.amount) * share) / totalShare).toString(),
  }));
}

export function applySlippageToAssets(assets: readonly Asset[], slippageBps: number): Asset[] {
  const safeBps = Number.isFinite(slippageBps) ? Math.min(10_000, Math.max(0, Math.round(slippageBps))) : 0;
  return assets.map((asset) => ({
    info: asset.info,
    amount: ((normalizeBaseAmount(asset.amount) * (BPS_DENOMINATOR - BigInt(safeBps))) / BPS_DENOMINATOR).toString(),
  }));
}
