import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  REGISTRY_ABI,
  REGISTRY_BYTECODE,
  setRegistryAddress,
  getRegistryAddress,
  registerReportOnChain,
  getReportFromChain,
} from "../src/contracts/registry.js";

describe("REGISTRY_ABI", () => {
  it("includes registerReport function", () => {
    expect(REGISTRY_ABI.some((e: string) => e.includes("registerReport"))).toBe(
      true
    );
  });

  it("includes getReport function", () => {
    expect(REGISTRY_ABI.some((e: string) => e.includes("getReport"))).toBe(
      true
    );
  });

  it("includes ReportRegistered event", () => {
    expect(
      REGISTRY_ABI.some((e: string) => e.includes("ReportRegistered"))
    ).toBe(true);
  });
});

describe("REGISTRY_BYTECODE", () => {
  it("is a valid hex string", () => {
    expect(REGISTRY_BYTECODE).toMatch(/^0x[a-f0-9]+$/);
  });

  it("is non-trivial (>100 bytes)", () => {
    expect(REGISTRY_BYTECODE.length).toBeGreaterThan(200);
  });
});

describe("setRegistryAddress / getRegistryAddress", () => {
  beforeEach(() => {
    setRegistryAddress("");
    delete process.env.POT_REGISTRY_ADDRESS;
  });

  it("returns null when no address is configured", () => {
    setRegistryAddress("");
    expect(getRegistryAddress()).toBeNull();
  });

  it("returns the address set via setRegistryAddress", () => {
    setRegistryAddress("0x1234567890abcdef1234567890abcdef12345678");
    expect(getRegistryAddress()).toBe(
      "0x1234567890abcdef1234567890abcdef12345678"
    );
  });

  it("falls back to POT_REGISTRY_ADDRESS env var", () => {
    setRegistryAddress("");
    process.env.POT_REGISTRY_ADDRESS = "0xEnvAddress";
    expect(getRegistryAddress()).toBe("0xEnvAddress");
    delete process.env.POT_REGISTRY_ADDRESS;
  });
});

describe("registerReportOnChain", () => {
  beforeEach(() => {
    setRegistryAddress("");
  });

  it("throws if no registry address is configured", async () => {
    const mockSigner = {};
    await expect(
      registerReportOnChain("0xpot", "0xroot", mockSigner)
    ).rejects.toThrow("Registry contract address not configured");
  });
});

describe("getReportFromChain", () => {
  beforeEach(() => {
    setRegistryAddress("");
  });

  it("throws if no registry address is configured", async () => {
    const mockProvider = {};
    await expect(getReportFromChain("0xpot", mockProvider)).rejects.toThrow(
      "Registry contract address not configured"
    );
  });
});
