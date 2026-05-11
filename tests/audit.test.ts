import { describe, it, expect } from "vitest";
import {
  AuditTrailStore,
  buildPaymentAuditRecord,
  decodeXPaymentHeader,
} from "../src/commerce/audit.js";
import type { PoTReport } from "../src/types/index.js";

const SAMPLE_REPORT: PoTReport = {
  id: "pot-1234567890-abc123",
  query: "What are the risks?",
  timestamp: "2026-04-27T00:00:00.000Z",
  responses: [
    {
      model: "qwen",
      provider: "0xProviderA",
      content: "Smart contract risk is high",
      chatID: "chat-1",
      teeSignature: {
        text: "Smart contract risk is high",
        signature: "0xsig-a",
        signing_address: "0xSignerA",
        signing_algo: "ecdsa",
        provider_type: "tee",
        provider_identity: "qwen",
        tls_cert_fingerprint: "fingerprint-a",
      },
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
      { text: "Smart contract risk", modelsAgreeing: ["qwen"], confidence: 1 },
    ],
    divergences: [],
  },
  proofChain: [
    {
      model: "qwen",
      provider: "0xProviderA",
      chatID: "chat-1",
      teeVerified: true,
      teeSignature: "0xsig-a",
    },
  ],
  potHash: "0xabcdef1234567890",
};

function headerGetter(headers: Record<string, string | undefined>) {
  return (name: string) => headers[name.toLowerCase()];
}

describe("decodeXPaymentHeader", () => {
  it("decodes base64 x402 payment payloads", () => {
    const payload = { txHash: "0xpayment", network: "base-sepolia" };
    const header = Buffer.from(JSON.stringify(payload), "utf-8").toString(
      "base64",
    );

    expect(decodeXPaymentHeader(header)).toEqual(payload);
  });

  it("decodes plain JSON for local test clients", () => {
    const payload = { transactionHash: "0xpayment" };
    expect(decodeXPaymentHeader(JSON.stringify(payload))).toEqual(payload);
  });

  it("returns null for malformed payloads", () => {
    expect(decodeXPaymentHeader("not-json-or-base64")).toBeNull();
  });
});

describe("buildPaymentAuditRecord", () => {
  it("captures payment and proof hashes for a paid report read", () => {
    const payment = { txHash: "0xpayment", payer: "0xPayer" };
    const xPayment = Buffer.from(JSON.stringify(payment), "utf-8").toString(
      "base64",
    );

    const record = buildPaymentAuditRecord({
      report: SAMPLE_REPORT,
      getHeader: headerGetter({
        "x-payment": xPayment,
        "user-agent": "vitest",
      }),
      ipAddress: "127.0.0.1",
      amount: "$0.01",
      network: "base-sepolia",
      payTo: "0xPayTo",
      route: "/api/report/pot-1234567890-abc123",
    });

    expect(record.reportId).toBe(SAMPLE_REPORT.id);
    expect(record.potHash).toBe(SAMPLE_REPORT.potHash);
    expect(record.paymentHeaderPresent).toBe(true);
    expect(record.paymentHeaderHash).toMatch(/^0x[a-f0-9]{64}$/);
    expect(record.paymentPayload).toEqual(payment);
    expect(record.paymentTxHash).toBe("0xpayment");
    expect(record.proofChainHash).toMatch(/^0x[a-f0-9]{64}$/);
    expect(record.teeProofHashes).toHaveLength(1);
    expect(record.teeProofHashes[0]).toMatch(/^0x[a-f0-9]{64}$/);
    expect(record.userAgent).toBe("vitest");
    expect(record.ipAddress).toBe("127.0.0.1");
  });

  it("records unpaid local reads without losing report provenance", () => {
    const record = buildPaymentAuditRecord({
      report: SAMPLE_REPORT,
      getHeader: headerGetter({}),
      amount: "$0.01",
      network: "base-sepolia",
      route: "/api/report/pot-1234567890-abc123",
    });

    expect(record.paymentHeaderPresent).toBe(false);
    expect(record.paymentHeaderHash).toBeNull();
    expect(record.paymentPayload).toBeNull();
    expect(record.paymentTxHash).toBeNull();
    expect(record.potHash).toBe(SAMPLE_REPORT.potHash);
  });
});

describe("AuditTrailStore", () => {
  it("keeps newest records when capped", () => {
    const store = new AuditTrailStore(1);
    const first = buildPaymentAuditRecord({
      report: SAMPLE_REPORT,
      getHeader: headerGetter({ "x-payment": '{"txHash":"0x1"}' }),
      amount: "$0.01",
      network: "base-sepolia",
      route: "/api/report/pot-1234567890-abc123",
    });
    const second = buildPaymentAuditRecord({
      report: { ...SAMPLE_REPORT, id: "pot-second" },
      getHeader: headerGetter({ "x-payment": '{"txHash":"0x2"}' }),
      amount: "$0.01",
      network: "base-sepolia",
      route: "/api/report/pot-second",
    });

    store.add(first);
    store.add(second);

    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].reportId).toBe("pot-second");
    expect(store.forReport(SAMPLE_REPORT.id)).toHaveLength(0);
    expect(store.forReport("pot-second")).toHaveLength(1);
  });
});
