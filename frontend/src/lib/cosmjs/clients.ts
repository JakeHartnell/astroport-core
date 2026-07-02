import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { Coin } from "@cosmjs/stargate";
import type { ExecuteResult } from "@cosmjs/cosmwasm-stargate/build/signingcosmwasmclient.js";
import type { StargateClient as ReadonlyStargateClient } from "@cosmjs/stargate/build/stargateclient.js";
// CosmJS publishes these browser-consumed packages as CommonJS build files.
// Import the concrete modules as defaults so Vite receives the CJS namespace object.
import signingCosmWasmClientModule from "@cosmjs/cosmwasm-stargate/build/signingcosmwasmclient.js";
import stargateClientModule from "@cosmjs/stargate/build/stargateclient.js";
import stargateFeeModule from "@cosmjs/stargate/build/fee.js";
import { dexRegistry } from "../../config/registry";

export type ExecuteClient = {
  execute: (
    senderAddress: string,
    contractAddress: string,
    msg: Record<string, unknown>,
    fee: "auto" | number,
    memo?: string,
    funds?: Coin[],
  ) => Promise<ExecuteResult>;
};

export type SigningClientGetter = () => Promise<ExecuteClient>;
export type SigningClientSource = OfflineSigner | SigningClientGetter | undefined;

const { SigningCosmWasmClient } = signingCosmWasmClientModule;
const { StargateClient } = stargateClientModule;
const { GasPrice } = stargateFeeModule;

let readonlyStargateClientPromise: Promise<ReadonlyStargateClient> | undefined;

export function getReadonlyStargateClient() {
  if (!StargateClient?.connect) {
    throw new Error("CosmJS readonly client failed to initialize");
  }
  readonlyStargateClientPromise ??= StargateClient.connect(dexRegistry.rpcEndpoint);
  return readonlyStargateClientPromise;
}

export async function getSigningClient(signer: OfflineSigner) {
  if (!SigningCosmWasmClient?.connectWithSigner || !GasPrice?.fromString) {
    throw new Error("CosmJS signing client failed to initialize");
  }

  return SigningCosmWasmClient.connectWithSigner(dexRegistry.rpcEndpoint, signer, {
    gasPrice: GasPrice.fromString("0.075ujuno"),
  });
}

export async function resolveSigningClient(source: SigningClientSource): Promise<ExecuteClient | undefined> {
  if (!source) return undefined;
  if (typeof source === "function") return source();
  return getSigningClient(source);
}
