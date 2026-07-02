const DEFAULT_PRICE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;
const DEFAULT_DECIMALS = 6;

const NATIVE_ALIASES = new Map([
  ["ujunox", "ujuno"],
]);

export function normalizeAssetId(asset) {
  if (asset === undefined || asset === null) return null;
  if (typeof asset === "object") {
    if (asset.native_token?.denom) return normalizeAssetId(asset.native_token.denom);
    if (asset.token?.contract_addr) return normalizeAssetId(asset.token.contract_addr);
    if (asset.denom) return normalizeAssetId(asset.denom);
    if (asset.asset) return normalizeAssetId(asset.asset);
    if (asset.address) return normalizeAssetId(asset.address);
  }

  const raw = String(asset).trim();
  if (!raw) return null;
  if (/^ibc\//i.test(raw)) return `ibc/${raw.slice(4).toUpperCase()}`;
  const lower = raw.toLowerCase();
  return NATIVE_ALIASES.get(lower) ?? lower;
}

export function normalizePriceRecord(record, now = new Date()) {
  const asset = normalizeAssetId(record.asset ?? record.denom ?? record.id ?? record.contractAddress ?? record.contract_address);
  const priceUsd = Number(record.priceUsd ?? record.price_usd ?? record.usd ?? record.price);
  const source = String(record.source ?? "stored");
  const observedAt = new Date(record.observedAt ?? record.observed_at ?? record.timestamp ?? record.updatedAt ?? record.updated_at ?? now);
  if (!asset || !Number.isFinite(priceUsd) || priceUsd <= 0 || Number.isNaN(observedAt.getTime())) return null;
  return {
    asset,
    priceUsd,
    source,
    observedAt: observedAt.toISOString(),
    isMock: Boolean(record.isMock ?? record.is_mock ?? source === "mock"),
    metadata: record.metadata ?? undefined,
  };
}

function freshnessStatus(observedAt, { now = new Date(), staleAfterMs = DEFAULT_STALE_AFTER_MS, allowStale = true } = {}) {
  const ageMs = now.getTime() - new Date(observedAt).getTime();
  if (!Number.isFinite(ageMs)) return { status: "missing", stale: false, ageMs: null };
  if (ageMs > staleAfterMs) return { status: allowStale ? "stale" : "missing", stale: true, ageMs };
  return { status: "fresh", stale: false, ageMs };
}

export class StaticPriceSource {
  constructor({ name = "stored", prices = [] } = {}) {
    this.name = name;
    this.prices = new Map();
    for (const price of prices) this.upsert(price);
  }

  upsert(record) {
    const normalized = normalizePriceRecord({ source: this.name, ...record });
    if (!normalized) return false;
    const previous = this.prices.get(normalized.asset);
    if (!previous || previous.observedAt <= normalized.observedAt) this.prices.set(normalized.asset, normalized);
    return true;
  }

  async getPrice(asset) {
    return this.prices.get(normalizeAssetId(asset)) ?? null;
  }
}

export class StoredTokenPriceSource extends StaticPriceSource {
  constructor({ prices = [] } = {}) {
    super({ name: "stored", prices });
  }
}

export class MockPriceSource extends StaticPriceSource {
  constructor({ now = new Date(), prices } = {}) {
    super({
      name: "mock",
      prices: prices ?? [
        { asset: "ujuno", priceUsd: 1.25, observedAt: now, isMock: true },
        { asset: "ibc/mock-usdc", priceUsd: 1, observedAt: now, isMock: true },
      ],
    });
  }
}

function pickProviderPrice(body, asset) {
  const normalized = normalizeAssetId(asset);
  if (Array.isArray(body?.prices)) return body.prices.find((entry) => normalizeAssetId(entry.asset ?? entry.denom ?? entry.id) === normalized) ?? null;
  if (Array.isArray(body?.data)) return body.data.find((entry) => normalizeAssetId(entry.asset ?? entry.denom ?? entry.id) === normalized) ?? null;
  if (body?.asset || body?.denom || body?.priceUsd || body?.price_usd || body?.price) return body;
  if (body && typeof body === "object") {
    const direct = body[normalized] ?? body[asset] ?? body[normalized?.toUpperCase?.()];
    if (typeof direct === "number" || typeof direct === "string") return { asset: normalized, priceUsd: direct };
    if (direct && typeof direct === "object") return { asset: normalized, ...direct };
  }
  return null;
}

export class HttpJsonPriceSource {
  constructor({ baseUrl, apiKey, name = "provider", fetchImpl = fetch } = {}) {
    if (!baseUrl) throw new Error("baseUrl is required for HttpJsonPriceSource");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.name = name;
    this.fetchImpl = fetchImpl;
  }

  async getPrice(asset) {
    const normalized = normalizeAssetId(asset);
    if (!normalized) return null;
    const url = new URL(this.baseUrl);
    url.searchParams.set("asset", normalized);
    const headers = this.apiKey ? { authorization: `Bearer ${this.apiKey}`, "x-api-key": this.apiKey } : {};
    const response = await this.fetchImpl(url, { headers });
    if (!response.ok) throw new Error(`${this.name} price request failed: ${response.status}`);
    const body = await response.json();
    const picked = pickProviderPrice(body, normalized);
    return normalizePriceRecord({ source: this.name, ...picked });
  }
}

export class PriceResolver {
  constructor({ sources = [], cacheTtlMs = DEFAULT_PRICE_TTL_MS, staleAfterMs = DEFAULT_STALE_AFTER_MS, allowStale = true, now = () => new Date() } = {}) {
    this.sources = sources;
    this.cacheTtlMs = cacheTtlMs;
    this.staleAfterMs = staleAfterMs;
    this.allowStale = allowStale;
    this.now = now;
    this.cache = new Map();
  }

  async resolve(asset) {
    const normalized = normalizeAssetId(asset);
    if (!normalized) return this.missing(asset);
    const now = this.now();
    const cached = this.cache.get(normalized);
    if (cached && now.getTime() - cached.cachedAt.getTime() <= this.cacheTtlMs) return cached.result;

    for (const source of this.sources) {
      const record = await source.getPrice(normalized);
      if (!record) continue;
      const freshness = freshnessStatus(record.observedAt, { now, staleAfterMs: this.staleAfterMs, allowStale: this.allowStale });
      const result = {
        asset: normalized,
        priceUsd: freshness.status === "missing" ? null : record.priceUsd,
        source: record.source ?? source.name ?? "unknown",
        status: freshness.status,
        stale: freshness.stale,
        observedAt: record.observedAt,
        ageMs: freshness.ageMs,
        isMock: Boolean(record.isMock),
      };
      this.cache.set(normalized, { cachedAt: now, result });
      return result;
    }

    const result = this.missing(normalized);
    this.cache.set(normalized, { cachedAt: now, result });
    return result;
  }

  async resolveMany(assets) {
    const unique = Array.from(new Set(assets.map(normalizeAssetId).filter(Boolean)));
    return Promise.all(unique.map((asset) => this.resolve(asset)));
  }

  missing(asset) {
    return { asset: normalizeAssetId(asset), priceUsd: null, source: null, status: "missing", stale: false, observedAt: null, ageMs: null, isMock: false };
  }
}

export function createPriceResolverFromEnv(env = process.env, { storedPrices = [], fetchImpl = fetch, now } = {}) {
  const sources = [];
  if (env.INDEXER_DEV_MOCKS === "true" || env.PRICE_DEV_MOCKS === "true") sources.push(new MockPriceSource({ now: now?.() ?? new Date() }));
  if (env.PRICE_PROVIDER_BASE_URL) {
    sources.push(new HttpJsonPriceSource({
      baseUrl: env.PRICE_PROVIDER_BASE_URL,
      apiKey: env.PRICE_PROVIDER_API_KEY,
      name: env.PRICE_PROVIDER_NAME ?? "provider",
      fetchImpl,
    }));
  }
  if (storedPrices.length > 0) sources.push(new StoredTokenPriceSource({ prices: storedPrices }));
  return new PriceResolver({
    sources,
    cacheTtlMs: Number(env.PRICE_CACHE_TTL_MS ?? DEFAULT_PRICE_TTL_MS),
    staleAfterMs: Number(env.PRICE_STALE_AFTER_MS ?? DEFAULT_STALE_AFTER_MS),
    allowStale: env.PRICE_ALLOW_STALE !== "false",
    now,
  });
}

export function amountToDisplayNumber(amount, decimals = DEFAULT_DECIMALS) {
  if (amount === undefined || amount === null || amount === "") return null;
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return null;
  return parsed / 10 ** Number(decimals ?? DEFAULT_DECIMALS);
}

export function priceMapFromResolved(prices) {
  const map = new Map();
  for (const price of prices ?? []) {
    const asset = normalizeAssetId(price?.asset);
    if (asset && price.priceUsd !== null && price.status !== "missing") map.set(asset, { ...price, asset });
  }
  return map;
}
