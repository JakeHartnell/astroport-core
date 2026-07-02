import type { SigningClientSource } from "../lib/cosmjs/clients";

export type WalletState = {
  status: "idle" | "connecting" | "connected" | "error";
  address?: string;
  name?: string;
  error?: string;
  chainId?: string;
  signer?: SigningClientSource;
};

export type NetworkGuardState = {
  expectedChainId: "juno-1";
  connectedChainId?: string;
  isWalletConnected: boolean;
  isRecovering: boolean;
  isWrongNetwork: boolean;
  isJunoReady: boolean;
  message?: string;
};
