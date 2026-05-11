import { keccak256, stringToBytes } from "viem";
import type { PoTReport } from "../types/index.js";

type HeaderGetter = (name: string) => string | undefined;

export interface PaymentAuditInput {
  report: PoTReport;
  getHeader: HeaderGetter;
  ipAddress?: string;
  amount: string;
  network: string;
  payTo?: string;
  route: string;
}

export interface PaymentAuditRecord {
  id: string;
  reportId: string;
  potHash: string;
  createdAt: string;
  route: string;
  amount: string;
  network: string;
  payTo: string | null;
  paymentHeaderPresent: boolean;
  paymentHeaderHash: string | null;
  paymentPayload: unknown | null;
  paymentTxHash: string | null;
  proofChainHash: string;
  teeProofHashes: string[];
  userAgent: string | null;
  ipAddress: string | null;
}

export class AuditTrailStore {
  private readonly records = new Map<string, PaymentAuditRecord>();

  constructor(private readonly maxRecords = 500) {}

  add(record: PaymentAuditRecord): PaymentAuditRecord {
    if (this.records.size >= this.maxRecords) {
      const oldest = this.records.keys().next().value;
      if (oldest !== undefined) this.records.delete(oldest);
    }
    this.records.set(record.id, record);
    return record;
  }

  list(): PaymentAuditRecord[] {
    return Array.from(this.records.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  forReport(reportId: string): PaymentAuditRecord[] {
    return this.list().filter((record) => record.reportId === reportId);
  }
}

export function buildPaymentAuditRecord(
  input: PaymentAuditInput,
): PaymentAuditRecord {
  const paymentHeader = input.getHeader("x-payment");
  const paymentPayload = paymentHeader
    ? decodeXPaymentHeader(paymentHeader)
    : null;
  const paymentTxHash = extractPaymentTxHash(paymentPayload);
  const teeProofHashes = input.report.proofChain.map(hashProofChainEntry);
  const createdAt = new Date().toISOString();

  return {
    id: auditRecordId(input.report.id, createdAt, paymentHeader),
    reportId: input.report.id,
    potHash: input.report.potHash,
    createdAt,
    route: input.route,
    amount: input.amount,
    network: input.network,
    payTo: input.payTo ?? null,
    paymentHeaderPresent: Boolean(paymentHeader),
    paymentHeaderHash: paymentHeader ? keccakText(paymentHeader) : null,
    paymentPayload,
    paymentTxHash,
    proofChainHash: keccakText(JSON.stringify(input.report.proofChain)),
    teeProofHashes,
    userAgent: input.getHeader("user-agent") ?? null,
    ipAddress: input.ipAddress ?? null,
  };
}

export function decodeXPaymentHeader(header: string): unknown | null {
  const trimmed = header.trim();
  if (!trimmed) return null;

  for (const candidate of [trimmed, toBase64(trimmed)]) {
    try {
      const decoded = Buffer.from(candidate, "base64").toString("utf-8");
      return JSON.parse(decoded);
    } catch {
      // Try the next encoding variant.
    }
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function hashProofChainEntry(entry: PoTReport["proofChain"][number]): string {
  return keccakText(
    JSON.stringify({
      model: entry.model,
      provider: entry.provider,
      chatID: entry.chatID,
      teeVerified: entry.teeVerified,
      teeSignature: entry.teeSignature,
    }),
  );
}

function auditRecordId(
  reportId: string,
  createdAt: string,
  paymentHeader?: string,
): string {
  return keccakText(`${reportId}:${createdAt}:${paymentHeader ?? ""}`);
}

function keccakText(value: string): string {
  return keccak256(stringToBytes(value));
}

function toBase64(value: string): string {
  return value.replace(/-/g, "+").replace(/_/g, "/");
}

function extractPaymentTxHash(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const value = payload as Record<string, unknown>;
  const candidates = [
    value.txHash,
    value.transactionHash,
    value.hash,
    value.paymentHash,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}
