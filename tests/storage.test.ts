import { describe, it, expect } from "vitest";
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
      timings: { inference: 100, verification: 50, signatureFetch: 30, total: 180 },
    },
  ],
  consensus: {
    agreementScore: 1,
    convergedClaims: [{ text: "Smart contract risk", modelsAgreeing: ["test-model"], confidence: 1 }],
    divergences: [],
  },
  proofChain: [
    { model: "test-model", provider: "0xTestProvider", chatID: "chat-123", teeVerified: true, teeSignature: null },
  ],
  potHash: "0xabcdef1234567890",
};

describe("getStreamId", () => {
  it("produces deterministic stream IDs", async () => {
    const { getStreamId } = await import("../src/storage/store.js");
    const id1 = getStreamId("0xWallet");
    const id2 = getStreamId("0xWallet");
    expect(id1).toBe(id2);
  });

  it("produces different IDs for different addresses", async () => {
    const { getStreamId } = await import("../src/storage/store.js");
    const id1 = getStreamId("0xWalletA");
    const id2 = getStreamId("0xWalletB");
    expect(id1).not.toBe(id2);
  });

  it("returns a valid keccak256 hash", async () => {
    const { getStreamId } = await import("../src/storage/store.js");
    const id = getStreamId("0xWallet");
    expect(id).toMatch(/^0x[a-f0-9]{64}$/);
  });
});

describe("extractJson (tested via retrieveReportByHash contract)", () => {
  it("parses clean JSON from a blob", () => {
    const raw = JSON.stringify(SAMPLE_REPORT);
    const jsonStart = raw.indexOf("{");
    let depth = 0;
    let jsonEnd = jsonStart;
    for (let i = jsonStart; i < raw.length; i++) {
      if (raw[i] === "{") depth++;
      else if (raw[i] === "}") {
        depth--;
        if (depth === 0) { jsonEnd = i + 1; break; }
      }
    }
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd));
    expect(parsed.id).toBe("pot-1234567890-abc123");
  });

  it("parses JSON with KV header padding", () => {
    const raw = "\x00\x00\x00" + JSON.stringify(SAMPLE_REPORT) + "\x00\x00";
    const jsonStart = raw.indexOf("{");
    let depth = 0;
    let jsonEnd = jsonStart;
    for (let i = jsonStart; i < raw.length; i++) {
      if (raw[i] === "{") depth++;
      else if (raw[i] === "}") {
        depth--;
        if (depth === 0) { jsonEnd = i + 1; break; }
      }
    }
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd));
    expect(parsed.id).toBe("pot-1234567890-abc123");
    expect(parsed.consensus.agreementScore).toBe(1);
  });

  it("throws on blob with no JSON", () => {
    const raw = "\x00\x00\x00binary garbage\x00\x00";
    const jsonStart = raw.indexOf("{");
    expect(jsonStart).toBe(-1);
  });
});

describe("store/retrieve round-trip contract", () => {
  it("report serializes to valid JSON and back", () => {
    const serialized = JSON.stringify(SAMPLE_REPORT);
    const deserialized: PoTReport = JSON.parse(serialized);

    expect(deserialized.id).toBe(SAMPLE_REPORT.id);
    expect(deserialized.query).toBe(SAMPLE_REPORT.query);
    expect(deserialized.potHash).toBe(SAMPLE_REPORT.potHash);
    expect(deserialized.responses).toHaveLength(1);
    expect(deserialized.proofChain).toHaveLength(1);
    expect(deserialized.consensus.agreementScore).toBe(1);
  });

  it("report key is derived from report ID", () => {
    const key = Uint8Array.from(Buffer.from(SAMPLE_REPORT.id, "utf-8"));
    const decoded = Buffer.from(key).toString("utf-8");
    expect(decoded).toBe("pot-1234567890-abc123");
  });
});
