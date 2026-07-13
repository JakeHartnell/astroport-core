import { describe, expect, it } from "vitest";
import { parseDexRegistry } from "../../config/registry";
import { getChainRegistryAsset, mergeAssetMetadata, resolveAssetMetadata } from "./assetMetadata";

describe("chain-registry asset metadata", () => {
  it("resolves JUNO metadata with decimals, name, and logo", () => {
    const juno = resolveAssetMetadata("ujuno");

    expect(juno.source).toBe("chain-registry");
    expect(juno.symbol).toBe("JUNO");
    expect(juno.name).toBe("Juno");
    expect(juno.decimals).toBe(6);
    expect(juno.logoURI).toMatch(/juno\.(svg|png)$/);
  });

  it("resolves IBC denom trace metadata and counterparty hints", () => {
    const atom = resolveAssetMetadata("ibc/C4CFF46FD6DE35CA4CF4CE031E643C8FDC9BA4B99AE598E9B0ED98FE3A2319F9");

    expect(atom.kind).toBe("ibc");
    expect(atom.symbol).toBe("ATOM");
    expect(atom.denomTrace).toBe("transfer/channel-1/uatom");
    expect(atom.trace?.counterpartyChainName).toBe("cosmoshub");
    expect(atom.trace?.counterpartyBaseDenom).toBe("uatom");
  });

  it("falls back safely for unknown IBC denoms without inventing trace metadata", () => {
    const unknown = resolveAssetMetadata("ibc/0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF");

    expect(unknown.source).toBe("fallback");
    expect(unknown.kind).toBe("ibc");
    expect(unknown.name).toBe("Unknown IBC asset");
    expect(unknown.decimals).toBe(6);
    expect(unknown.denomTrace).toBeUndefined();
  });

  it("merges metadata into curated assets without weakening registry validation", () => {
    const curated = mergeAssetMetadata({ kind: "native", id: "ujuno", symbol: "CURATED-JUNO", decimals: 6 });

    expect(curated.symbol).toBe("CURATED-JUNO");
    expect(curated.logoURI).toBe(getChainRegistryAsset("ujuno")?.logoURI);
    expect(curated.name).toBe("Juno");
    expect(() => parseDexRegistry({ chainId: "juno-1", pools: [] })).toThrow(/chainName/);
  });

  it("provides local logos for Season 0 test TokenFactory assets", () => {
    const expected = [
      ["factory/juno1xsx746x4375g39f9fj07hr7qm0wuf0ksl0an76/junoagenttest202607010323", "/token-logos/season0/junoagent-test.svg"],
      ["factory/juno1xsx746x4375g39f9fj07hr7qm0wuf0ksl0an76/twolf", "/token-logos/season0/twolf.jpg"],
      ["factory/juno1xsx746x4375g39f9fj07hr7qm0wuf0ksl0an76/traw", "/token-logos/season0/traw.jpg"],
      ["factory/juno1xsx746x4375g39f9fj07hr7qm0wuf0ksl0an76/tahab", "/token-logos/season0/tahab.jpg"],
      ["factory/juno1xsx746x4375g39f9fj07hr7qm0wuf0ksl0an76/tfud", "/token-logos/season0/tfud.jpg"],
    ] as const;

    for (const [denom, logoURI] of expected) {
      expect(resolveAssetMetadata(denom).logoURI).toBe(logoURI);
    }
  });
});
