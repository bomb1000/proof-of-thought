import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { ethers } = require("ethers");

import type { ModelResponse, ConsensusResult, PoTReport } from "../types/index.js";

export function buildReport(
  query: string,
  responses: ModelResponse[],
  consensus: ConsensusResult
): PoTReport {
  const proofChain = responses.map((r) => ({
    model: r.model,
    provider: r.provider,
    chatID: r.chatID,
    teeVerified: r.teeVerified,
    teeSignature: r.teeSignature?.signature ?? null,
  }));

  const report: PoTReport = {
    id: `pot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query,
    timestamp: new Date().toISOString(),
    responses,
    consensus,
    proofChain,
    potHash: "",
  };

  const hashInput = JSON.stringify({
    query: report.query,
    timestamp: report.timestamp,
    responses: report.responses.map((r) => ({
      model: r.model,
      provider: r.provider,
      content: r.content,
      chatID: r.chatID,
      teeSignature: r.teeSignature?.signature,
      teeVerified: r.teeVerified,
    })),
    consensus: report.consensus,
  });

  report.potHash = ethers.keccak256(ethers.toUtf8Bytes(hashInput));
  return report;
}

export function formatReport(report: PoTReport): string {
  const lines: string[] = [];
  const hr = "═".repeat(60);

  lines.push(hr);
  lines.push("  PROOF OF THOUGHT REPORT");
  lines.push(hr);
  lines.push(`  ID:        ${report.id}`);
  lines.push(`  Query:     ${report.query}`);
  lines.push(`  Timestamp: ${report.timestamp}`);
  lines.push(`  PoT Hash:  ${report.potHash}`);
  lines.push("");

  lines.push("  RESPONSES");
  lines.push("  " + "─".repeat(56));
  for (const r of report.responses) {
    const tee = r.teeVerified ? "✓ TEE VERIFIED" : "✗ unverified";
    lines.push(`  [${r.model}] ${tee}`);
    lines.push(`    Provider:  ${r.provider}`);
    lines.push(`    Chat ID:   ${r.chatID}`);
    if (r.teeSignature) {
      lines.push(`    Signer:    ${r.teeSignature.signing_address}`);
      lines.push(`    Sig:       ${r.teeSignature.signature.slice(0, 20)}...`);
      lines.push(`    TLS Cert:  ${r.teeSignature.tls_cert_fingerprint.slice(0, 20)}...`);
    }
    lines.push(`    Timings:   inference=${r.timings.inference.toFixed(0)}ms verify=${r.timings.verification.toFixed(0)}ms sig=${r.timings.signatureFetch.toFixed(0)}ms`);
    lines.push(`    Response:  ${r.content.slice(0, 120)}...`);
    lines.push("");
  }

  lines.push("  CONSENSUS");
  lines.push("  " + "─".repeat(56));
  lines.push(
    `  Agreement Score: ${(report.consensus.agreementScore * 100).toFixed(1)}%`
  );
  lines.push("");

  if (report.consensus.convergedClaims.length > 0) {
    lines.push("  Converged Claims:");
    for (const c of report.consensus.convergedClaims) {
      const models = c.modelsAgreeing.join(", ");
      lines.push(`    ✓ [${models}] ${c.text}`);
    }
    lines.push("");
  }

  if (report.consensus.divergences.length > 0) {
    lines.push("  Divergences:");
    for (const d of report.consensus.divergences) {
      lines.push(`    ⚡ Topic: ${d.topic}`);
      for (const p of d.positions) {
        lines.push(`       ${p.model}: ${p.stance.slice(0, 80)}`);
      }
    }
    lines.push("");
  }

  if (report.proofChain.length > 0) {
    lines.push("  PROOF CHAIN");
    lines.push("  " + "─".repeat(56));
    for (const p of report.proofChain) {
      const verified = p.teeVerified ? "✓" : "✗";
      lines.push(`    ${verified} ${p.model} → ${p.chatID}`);
    }
    lines.push("");
  }

  if (report.storedOn) {
    lines.push(`  Stored on: ${report.storedOn}`);
  }

  lines.push(hr);
  return lines.join("\n");
}
