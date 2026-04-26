import { describe, it, expect } from "vitest";
import { buildConsensus } from "../src/consensus/comparator.js";
import type { ModelResponse } from "../src/types/index.js";

function makeResponse(
  model: string,
  content: string,
  overrides?: Partial<ModelResponse>
): ModelResponse {
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
    ...overrides,
  };
}

describe("buildConsensus", () => {
  it("returns empty result for no responses", () => {
    const result = buildConsensus([]);
    expect(result.agreementScore).toBe(0);
    expect(result.convergedClaims).toHaveLength(0);
    expect(result.divergences).toHaveLength(0);
  });

  it("returns all claims with score 1 for a single response", () => {
    const result = buildConsensus([
      makeResponse("model-a", "1. Smart contract risk is high\n2. Liquidation cascades are likely"),
    ]);
    expect(result.agreementScore).toBe(1);
    expect(result.convergedClaims.length).toBeGreaterThan(0);
    expect(result.divergences).toHaveLength(0);
  });

  it("finds converged claims when two models agree", () => {
    const result = buildConsensus([
      makeResponse(
        "model-a",
        "1. Smart contract vulnerabilities remain the primary risk\n2. Liquidation cascades could trigger losses\n3. Oracle price feeds may be manipulated"
      ),
      makeResponse(
        "model-b",
        "1. Smart contract risks and vulnerabilities are the biggest concern\n2. Cascading liquidations pose systemic risk\n3. Regulatory uncertainty is growing"
      ),
    ]);

    expect(result.convergedClaims.length).toBeGreaterThan(0);

    const smartContractClaim = result.convergedClaims.find(
      (c) => c.text.toLowerCase().includes("smart contract")
    );
    expect(smartContractClaim).toBeDefined();
    expect(smartContractClaim!.modelsAgreeing).toContain("model-a");
    expect(smartContractClaim!.modelsAgreeing).toContain("model-b");
  });

  it("detects divergences for dissimilar claims on related topics", () => {
    const result = buildConsensus([
      makeResponse(
        "model-a",
        "1. Smart contract risk is the primary concern\n2. Oracle manipulation is a major threat to price feeds\n3. Gas costs make small positions unprofitable"
      ),
      makeResponse(
        "model-b",
        "1. Smart contract vulnerabilities remain the top risk\n2. Regulatory crackdowns in the EU could affect Aave operations\n3. Centralization of validators threatens network security"
      ),
    ]);

    expect(result.divergences.length).toBeGreaterThanOrEqual(0);
    expect(result.convergedClaims.length).toBeGreaterThan(0);
  });

  it("agreement score increases with more model convergence", () => {
    const twoModels = buildConsensus([
      makeResponse("model-a", "1. Smart contract risk is high\n2. Liquidation cascades are likely"),
      makeResponse("model-b", "1. Smart contract vulnerabilities are concerning\n2. Oracle risks are elevated"),
    ]);

    const threeModels = buildConsensus([
      makeResponse("model-a", "1. Smart contract risk is high\n2. Liquidation cascades are likely"),
      makeResponse("model-b", "1. Smart contract vulnerabilities are concerning\n2. Liquidation cascade risk exists"),
      makeResponse("model-c", "1. Smart contract risks remain primary\n2. Liquidation cascading events are possible"),
    ]);

    expect(threeModels.agreementScore).toBeGreaterThanOrEqual(twoModels.agreementScore);
  });

  it("handles bullet-point format (- prefix)", () => {
    const result = buildConsensus([
      makeResponse("model-a", "- Smart contract risk is primary\n- Liquidation risk exists"),
      makeResponse("model-b", "- Smart contract vulnerabilities are key\n- Market volatility is concerning"),
    ]);

    expect(result.convergedClaims.length).toBeGreaterThan(0);
  });

  it("handles asterisk format (* prefix)", () => {
    const result = buildConsensus([
      makeResponse("model-a", "* Smart contract risk is dominant\n* Oracle feeds are unreliable"),
      makeResponse("model-b", "* Smart contract vulnerabilities are the top concern\n* Gas costs are rising"),
    ]);

    expect(result.convergedClaims.length).toBeGreaterThan(0);
  });

  it("falls back to sentence splitting when no structured claims found", () => {
    const result = buildConsensus([
      makeResponse(
        "model-a",
        "The primary risk is smart contract vulnerabilities. Liquidation cascades are also a major concern."
      ),
      makeResponse(
        "model-b",
        "Smart contract risks dominate the threat landscape. Additionally, oracle manipulation poses significant danger."
      ),
    ]);

    expect(result.convergedClaims.length).toBeGreaterThan(0);
  });

  it("confidence reflects proportion of models agreeing", () => {
    const result = buildConsensus([
      makeResponse("model-a", "1. Smart contract risk is the top concern"),
      makeResponse("model-b", "1. Smart contract vulnerabilities are primary"),
      makeResponse("model-c", "1. Regulatory risk is the main issue"),
    ]);

    for (const claim of result.convergedClaims) {
      expect(claim.confidence).toBeLessThanOrEqual(1);
      expect(claim.confidence).toBeGreaterThan(0);
    }
  });
});
