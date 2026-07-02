import { describe, expect, it } from "vitest";
import { decodeTxError } from "./errors";

describe("decodeTxError", () => {
  it("maps max spread errors to slippage guidance", () => {
    const decoded = decodeTxError(new Error("execute wasm contract failed: Generic error: Max spread assertion"));
    expect(decoded.kind).toBe("max-spread");
    expect(decoded.title).toMatch(/price moved/i);
    expect(decoded.retryable).toBe(true);
  });

  it("maps insufficient funds to balance guidance", () => {
    const decoded = decodeTxError("insufficient funds: spendable balance 10ujuno is smaller than 100ujuno");
    expect(decoded.kind).toBe("insufficient-funds");
    expect(decoded.message).toMatch(/balance/i);
    expect(decoded.retryable).toBe(false);
  });

  it("maps wallet rejection to retryable rejected copy", () => {
    const decoded = decodeTxError({ message: "Request rejected by user" });
    expect(decoded.kind).toBe("user-rejected");
    expect(decoded.title).toMatch(/rejected/i);
    expect(decoded.retryable).toBe(true);
  });

  it("keeps unknown raw detail visible", () => {
    const decoded = decodeTxError("codespace 5: mysterious module error");
    expect(decoded.kind).toBe("unknown");
    expect(decoded.message).toContain("codespace 5: mysterious module error");
    expect(decoded.raw).toBe("codespace 5: mysterious module error");
  });
});
