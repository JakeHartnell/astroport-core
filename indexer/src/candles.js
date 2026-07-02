const INTERVAL_MS = {
  "5m": 5 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

export const SUPPORTED_CANDLE_INTERVALS = Object.freeze(Object.keys(INTERVAL_MS));
export const DEFAULT_CANDLE_INTERVAL = "1h";
export const DEFAULT_CANDLE_LIMIT = 200;
export const MAX_CANDLE_LIMIT = 500;

export function parseCandleLimit(value, fallback = DEFAULT_CANDLE_LIMIT) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_CANDLE_LIMIT);
}

export function validateCandleInterval(interval = DEFAULT_CANDLE_INTERVAL) {
  if (!SUPPORTED_CANDLE_INTERVALS.includes(interval)) {
    throw new RangeError(`unsupported interval: ${interval}`);
  }
  return interval;
}

export function parseTime(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`invalid timestamp: ${value}`);
  return date;
}

export function bucketStartFor(timestamp, interval) {
  const safeInterval = validateCandleInterval(interval);
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new RangeError(`invalid timestamp: ${timestamp}`);
  return new Date(Math.floor(date.getTime() / INTERVAL_MS[safeInterval]) * INTERVAL_MS[safeInterval]).toISOString();
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scaleAmount(amount, decimals = 0) {
  const parsed = finiteNumber(amount);
  if (parsed === null) return null;
  return parsed / (10 ** (Number(decimals) || 0));
}

export function deriveSwapPrice(swap, { baseAsset, quoteAsset, decimals = {} } = {}) {
  const offerAsset = swap.offerAsset ?? swap.offer_asset;
  const askAsset = swap.askAsset ?? swap.ask_asset;
  const offerAmount = scaleAmount(swap.offerAmount ?? swap.offer_amount, decimals[offerAsset] ?? 0);
  const returnAmount = scaleAmount(swap.returnAmount ?? swap.return_amount ?? swap.askAmount ?? swap.ask_amount, decimals[askAsset] ?? 0);
  if (!offerAsset || !askAsset || offerAmount === null || returnAmount === null || offerAmount <= 0 || returnAmount <= 0) return null;

  if (baseAsset && quoteAsset) {
    if (offerAsset === baseAsset && askAsset === quoteAsset) {
      return { price: returnAmount / offerAmount, baseVolume: offerAmount, quoteVolume: returnAmount };
    }
    if (offerAsset === quoteAsset && askAsset === baseAsset) {
      return { price: offerAmount / returnAmount, baseVolume: returnAmount, quoteVolume: offerAmount };
    }
    return null;
  }

  return {
    price: returnAmount / offerAmount,
    baseVolume: offerAmount,
    quoteVolume: returnAmount,
    baseAsset: offerAsset,
    quoteAsset: askAsset,
  };
}

export function aggregateCandlesFromSwaps(swaps, { interval = DEFAULT_CANDLE_INTERVAL, poolId, pairAddress, baseAsset, quoteAsset, decimals = {}, dataSource = "indexer", isMock = false } = {}) {
  const safeInterval = validateCandleInterval(interval);
  const buckets = new Map();
  const orderedSwaps = [...swaps].sort((a, b) => new Date(a.timestamp ?? a.blockTime ?? a.block_time).getTime() - new Date(b.timestamp ?? b.blockTime ?? b.block_time).getTime());

  for (const swap of orderedSwaps) {
    const timestamp = swap.timestamp ?? swap.blockTime ?? swap.block_time;
    const derived = deriveSwapPrice(swap, { baseAsset, quoteAsset, decimals });
    if (!timestamp || !derived || derived.price <= 0 || !Number.isFinite(derived.price)) continue;
    const bucketStart = bucketStartFor(timestamp, safeInterval);
    const current = buckets.get(bucketStart);
    if (!current) {
      buckets.set(bucketStart, {
        poolId: poolId ?? swap.poolId ?? swap.pool_id ?? swap.pairAddress ?? swap.pair_address,
        pairAddress: pairAddress ?? swap.pairAddress ?? swap.pair_address ?? poolId ?? null,
        baseAsset: baseAsset ?? derived.baseAsset ?? swap.offerAsset ?? swap.offer_asset ?? null,
        quoteAsset: quoteAsset ?? derived.quoteAsset ?? swap.askAsset ?? swap.ask_asset ?? null,
        interval: safeInterval,
        bucketStart,
        open: derived.price,
        high: derived.price,
        low: derived.price,
        close: derived.price,
        volume: derived.baseVolume,
        volumeQuote: derived.quoteVolume,
        tradeCount: 1,
        dataSource,
        isMock,
      });
      continue;
    }
    current.high = Math.max(current.high, derived.price);
    current.low = Math.min(current.low, derived.price);
    current.close = derived.price;
    current.volume += derived.baseVolume;
    current.volumeQuote += derived.quoteVolume;
    current.tradeCount += 1;
  }

  return [...buckets.values()].map(normalizeCandleRecord);
}

export function normalizeCandleRecord(record) {
  const bucketStart = record.bucketStart ?? record.bucket_start;
  const interval = validateCandleInterval(record.interval ?? DEFAULT_CANDLE_INTERVAL);
  return {
    poolId: record.poolId ?? record.pool_id ?? record.pairAddress ?? record.pair_address ?? null,
    pairAddress: record.pairAddress ?? record.pair_address ?? record.poolId ?? record.pool_id ?? null,
    baseAsset: record.baseAsset ?? record.base_asset ?? record.asset ?? null,
    quoteAsset: record.quoteAsset ?? record.quote_asset ?? "uusd",
    interval,
    bucketStart: bucketStart ? new Date(bucketStart).toISOString() : new Date(0).toISOString(),
    open: Number(record.open),
    high: Number(record.high),
    low: Number(record.low),
    close: Number(record.close),
    volume: Number(record.volume ?? 0),
    volumeQuote: Number(record.volumeQuote ?? record.volume_quote ?? record.volume_usd ?? 0),
    tradeCount: Number(record.tradeCount ?? record.trade_count ?? 0),
    dataSource: record.dataSource ?? record.data_source ?? "indexer",
    isMock: Boolean(record.isMock ?? record.is_mock),
  };
}

export function filterCandles(candles, { interval = DEFAULT_CANDLE_INTERVAL, from, to, baseAsset, quoteAsset } = {}) {
  const safeInterval = validateCandleInterval(interval);
  const fromDate = parseTime(from, new Date(0));
  const toDate = parseTime(to, new Date("9999-12-31T23:59:59.999Z"));
  if (fromDate > toDate) throw new RangeError("from must be before to");
  return candles
    .map(normalizeCandleRecord)
    .filter((candle) => candle.interval === safeInterval)
    .filter((candle) => !baseAsset || candle.baseAsset === baseAsset)
    .filter((candle) => !quoteAsset || candle.quoteAsset === quoteAsset)
    .filter((candle) => {
      const ts = new Date(candle.bucketStart);
      return ts >= fromDate && ts <= toDate;
    })
    .sort((a, b) => new Date(a.bucketStart).getTime() - new Date(b.bucketStart).getTime());
}
