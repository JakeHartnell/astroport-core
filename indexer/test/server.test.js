import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createIndexerApi } from "../src/server.js";
import { createDevMockStore } from "../src/store.js";

async function startTestServer() {
  const server = createIndexerApi({ store: createDevMockStore(new Date("2026-07-02T12:00:00.000Z")) });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

describe("indexer API routes", () => {
  let server;
  let baseUrl;

  before(async () => {
    ({ server, baseUrl } = await startTestServer());
  });

  after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("serves health with mock status", async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "ok");
    assert.equal(body.dataSource, "mock");
    assert.equal(body.isMock, true);
  });

  it("returns frontend-compatible pool metrics", async () => {
    const response = await fetch(`${baseUrl}/pools`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].pairAddress, "juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv");
    assert.equal(body.data[0].tvlUsd, 2500);
    assert.equal(body.data[0].assets[0].priceUsd, 1.25);
    assert.equal(body.data[0].assets[0].priceStatus, "fresh");
    assert.equal(body.data[0].assets[1].priceUsd, 1);
    assert.equal(body.data[0].feeApr, 17.52);
    assert.equal(body.data[0].incentivesApr, 21.9);
    assert.equal(body.data[0].totalApr, 39.42);
    assert.equal(body.data[0].isMock, true);
  });

  it("resolves denom prices from the API", async () => {
    const response = await fetch(`${baseUrl}/prices?assets=ujunox,ibc/mock-usdc,ibc/unknown`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data[0].asset, "ujuno");
    assert.equal(body.data[0].priceUsd, 1.25);
    assert.equal(body.data[0].source, "mock");
    assert.equal(body.data[0].isMock, true);
    assert.equal(body.data[2].status, "missing");
    assert.equal(body.data[2].priceUsd, null);

    const single = await (await fetch(`${baseUrl}/prices/ujuno`)).json();
    assert.equal(single.priceUsd, 1.25);
  });

  it("returns pool detail, positions, wallet positions and wallet history", async () => {
    const poolId = "juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv";
    const wallet = "juno1mockwalletxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

    const pool = await (await fetch(`${baseUrl}/pools/${poolId}`)).json();
    assert.equal(pool.id, poolId);

    const poolPositions = await (await fetch(`${baseUrl}/pools/${poolId}/positions`)).json();
    assert.equal(poolPositions.data[0].walletAddress, wallet);

    const walletPositions = await (await fetch(`${baseUrl}/wallets/${wallet}/positions`)).json();
    assert.equal(walletPositions.data[0].pairAddress, poolId);

    const history = await (await fetch(`${baseUrl}/wallets/${wallet}/history`)).json();
    assert.equal(history.data[0].txHash, "MOCK_TX_HASH_DO_NOT_USE_AS_PRODUCTION_DATA");
  });

  it("returns typed pool candles with range filters and mock markers", async () => {
    const poolId = "juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv";
    const response = await fetch(`${baseUrl}/pools/${poolId}/candles?interval=1h&from=2026-07-02T10:00:00.000Z&limit=9999&baseAsset=ujuno&quoteAsset=ibc/mock-usdc`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.pagination.limit, 500);
    assert.equal(body.meta.interval, "1h");
    assert.equal(body.meta.isMock, true);
    assert.equal(body.data.length, 2);
    assert.equal(body.data[0].poolId, poolId);
    assert.equal(body.data[0].baseAsset, "ujuno");
    assert.equal(body.data[0].quoteAsset, "ibc/mock-usdc");
    assert.equal(body.data[0].isMock, true);
    assert.equal(typeof body.data[0].open, "number");
    assert.equal(typeof body.data[0].tradeCount, "number");
  });

  it("rejects invalid candle query params without a 500", async () => {
    const poolId = "juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv";
    const response = await fetch(`${baseUrl}/pools/${poolId}/candles?interval=15m`);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, "bad_request");
  });

  it("404s unknown pools", async () => {
    const response = await fetch(`${baseUrl}/pools/missing`);
    assert.equal(response.status, 404);
  });
});
