import { describe, expect, it } from "vitest";
import type { RegistryAsset } from "../../config/registry";
import { createSwapMessage } from "./messages";

const juno: RegistryAsset = { kind: "native", id: "ujuno", symbol: "JUNO", decimals: 6 };
const testToken: RegistryAsset = { kind: "ibc", id: "ibc/test", symbol: "TEST", decimals: 6 };

describe("createSwapMessage", () => {
  it("builds a direct pair swap payload with native funds and max spread", () => {
    const payload = createSwapMessage(juno, testToken, "1000000", "0.005");

    expect(payload).toEqual({
      msg: {
        swap: {
          offer_asset: { info: { native_token: { denom: "ujuno" } }, amount: "1000000" },
          ask_asset_info: { native_token: { denom: "ibc/test" } },
          max_spread: "0.005",
        },
      },
      funds: [{ denom: "ujuno", amount: "1000000" }],
    });
  });
});
