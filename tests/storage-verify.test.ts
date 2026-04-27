import { describe, it, expect } from "vitest";
import { verifyReportIntegrity } from "../src/storage/store.js";
import type { PoTReport } from "../src/types/index.js";

const SAMPLE_REPORT: PoTReport = {
  id: "pot-1234567890-abc123",
  query: "What are the risks?",
  timestamp: "2026-04-27T00:00:00.000Z",
  responses: [
    {
      model: "test-model",
      provider: "0xTestProvider",
      content: "1. Smart contract risk\n2. Liquidation risk",
      chatID: "chat-123",
      teeSignature: null,
      teeVerified: true,
      attestationUrl: "https://example.com/attestation",
      timestamp: "2026-04-27T00:00:00.000Z",
      timings: {
        inference: 100,
        verification: 50,
        signatureFetch: 30,
        total: 180,
      },
    },
  ],
  consensus: {
    agreementScore: 1,
    convergedClaims: [
      {
        text: "Smart contract risk",
        modelsAgreeing: ["test-model"],
        confidence: 1,
      },
    ],
    divergences: [],
  },
  proofChain: [
    {
      model: "test-model",
      provider: "0xTestProvider",
      chatID: "chat-123",
      teeVerified: true,
      teeSignature: null,
    },
  ],
  potHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
};

describe("verifyReportIntegrity", () => {
  it("returns verified: true when potHash matches", () => {
    const result = verifyReportIntegrity(SAMPLE_REPORT, { ...SAMPLE_REPORT });
    expect(result.verified).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns verified: false when retrieved is null", () => {
    const result = verifyReportIntegrity(SAMPLE_REPORT, null);
    expect(result.verified).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns verified: false on potHash mismatch", () => {
    const tampered = { ...SAMPLE_REPORT, potHash: "0xdifferenthash" };
    const result = verifyReportIntegrity(SAMPLE_REPORT, tampered);
    expect(result.verified).toBe(false);
    expect(result.error).toContain("mismatch");
    expect(result.error).toContain(SAMPLE_REPORT.potHash);
    expect(result.error).toContain("0xdifferenthash");
  });

  it("verifies identity (same object reference)", () => {
    const result = verifyReportIntegrity(SAMPLE_REPORT, SAMPLE_REPORT);
    expect(result.verified).toBe(true);
  });

  it("verifies after JSON round-trip", () => {
    const roundTripped: PoTReport = JSON.parse(JSON.stringify(SAMPLE_REPORT));
    const result = verifyReportIntegrity(SAMPLE_REPORT, roundTripped);
    expect(result.verified).toBe(true);
  });
});
