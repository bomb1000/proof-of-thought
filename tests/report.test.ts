import { describe, it, expect } from "vitest";
import { buildReport, formatReport } from "../src/consensus/report.js";
import type { ModelResponse, ConsensusResult } from "../src/types/index.js";

function makeResponse(model: string, content: string): ModelResponse {
  return {
    model,
    provider: `0x${model.replace(/\W/g, "")}`,
    content,
    chatID: `chat-${model}`,
    teeSignature: null,
    teeVerified: true,
    attestationUrl: "https://example.com/attestation",
    timestamp: new Date().toISOString(),
    timings: { inference: 100, verification: 50, signatureFetch: 30, total: 180 },
  };
}

const MOCK_CONSENSUS: ConsensusResult = {
  agreementScore: 0.85,
  convergedClaims: [
    {
      text: "Smart contract risk is the primary concern",
      modelsAgreeing: ["model-a", "model-b"],
      confidence: 0.85,
    },
  ],
  divergences: [
    {
      topic: "oracle",
      positions: [
        { model: "model-a", stance: "Oracle risk is high" },
        { model: "model-b", stance: "Oracle risk is moderate" },
      ],
    },
  ],
};

describe("buildReport", () => {
  it("generates a report with all required fields", () => {
    const responses = [
      makeResponse("model-a", "Smart contract risk is high"),
      makeResponse("model-b", "Smart contract vulnerabilities exist"),
    ];

    const report = buildReport("What are the risks?", responses, MOCK_CONSENSUS);

    expect(report.id).toMatch(/^pot-\d+-\w+$/);
    expect(report.query).toBe("What are the risks?");
    expect(report.timestamp).toBeTruthy();
    expect(report.responses).toHaveLength(2);
    expect(report.consensus).toBe(MOCK_CONSENSUS);
    expect(report.potHash).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it("builds a proof chain from responses", () => {
    const responses = [
      makeResponse("model-a", "content-a"),
      makeResponse("model-b", "content-b"),
    ];

    const report = buildReport("query", responses, MOCK_CONSENSUS);

    expect(report.proofChain).toHaveLength(2);
    expect(report.proofChain[0].model).toBe("model-a");
    expect(report.proofChain[0].teeVerified).toBe(true);
    expect(report.proofChain[1].model).toBe("model-b");
  });

  it("produces different hashes for different queries", () => {
    const responses = [makeResponse("model-a", "content")];

    const report1 = buildReport("query-1", responses, MOCK_CONSENSUS);
    const report2 = buildReport("query-2", responses, MOCK_CONSENSUS);

    expect(report1.potHash).not.toBe(report2.potHash);
  });

  it("produces different hashes for different responses", () => {
    const report1 = buildReport(
      "query",
      [makeResponse("model-a", "response-1")],
      MOCK_CONSENSUS
    );
    const report2 = buildReport(
      "query",
      [makeResponse("model-a", "response-2")],
      MOCK_CONSENSUS
    );

    expect(report1.potHash).not.toBe(report2.potHash);
  });
});

describe("formatReport", () => {
  it("includes key sections in formatted output", () => {
    const responses = [
      makeResponse("model-a", "Smart contract risk is high"),
      makeResponse("model-b", "Smart contract vulnerabilities exist"),
    ];
    const report = buildReport("What are the risks?", responses, MOCK_CONSENSUS);
    const output = formatReport(report);

    expect(output).toContain("PROOF OF THOUGHT REPORT");
    expect(output).toContain("What are the risks?");
    expect(output).toContain("RESPONSES");
    expect(output).toContain("CONSENSUS");
    expect(output).toContain("PROOF CHAIN");
    expect(output).toContain("85.0%");
    expect(output).toContain("✓ TEE VERIFIED");
    expect(output).toContain("model-a");
    expect(output).toContain("model-b");
  });

  it("shows divergences when present", () => {
    const responses = [makeResponse("model-a", "content")];
    const report = buildReport("query", responses, MOCK_CONSENSUS);
    const output = formatReport(report);

    expect(output).toContain("Divergences");
    expect(output).toContain("oracle");
  });

  it("shows converged claims", () => {
    const responses = [makeResponse("model-a", "content")];
    const report = buildReport("query", responses, MOCK_CONSENSUS);
    const output = formatReport(report);

    expect(output).toContain("Converged Claims");
    expect(output).toContain("Smart contract risk is the primary concern");
  });
});
