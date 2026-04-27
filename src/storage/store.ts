import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Indexer, KvClient, Batcher, getFlowContract } = require("@0gfoundation/0g-ts-sdk");
const { ethers } = require("ethers");

import type { PoTReport } from "../types/index.js";

const INDEXER_RPC = process.env.OG_INDEXER_RPC || "https://indexer-storage-testnet-turbo.0g.ai";
const KV_RPC = process.env.OG_KV_RPC || "http://3.101.147.150:6789";

export function getStreamId(address: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(`pot-reports-${address}`));
}

export async function storeReport(
  report: PoTReport,
  evmRpc: string,
  signer: any
): Promise<{ txHash: string; rootHash: string }> {
  const address = await signer.getAddress();
  const streamId = getStreamId(address);

  const indexer = new Indexer(INDEXER_RPC);
  const [nodes, nodeErr] = await indexer.selectNodes(1);
  if (nodeErr || !nodes?.length) {
    throw new Error(`Failed to select storage nodes: ${nodeErr}`);
  }

  const status = await nodes[0].getStatus();
  const flowAddress = status.networkIdentity.flowAddress;
  const flow = getFlowContract(flowAddress, signer);

  const batcher = new Batcher(1, nodes, flow, evmRpc);
  const key = Uint8Array.from(Buffer.from(report.id, "utf-8"));
  const data = Uint8Array.from(Buffer.from(JSON.stringify(report), "utf-8"));

  batcher.streamDataBuilder.set(streamId, key, data);
  const [txResult, txErr] = await batcher.exec();

  if (txErr) {
    throw new Error(`Storage write failed: ${txErr}`);
  }

  return { txHash: txResult.txHash, rootHash: txResult.rootHash };
}

export async function retrieveReportByHash(rootHash: string): Promise<PoTReport> {
  const indexer = new Indexer(INDEXER_RPC);
  const [blob, err] = await indexer.downloadToBlob(rootHash);

  if (err) {
    throw new Error(`Storage read failed: ${err}`);
  }

  const raw = await blob.text();
  return extractJson(raw);
}

export async function retrieveReportByKey(
  address: string,
  reportId: string
): Promise<PoTReport | null> {
  const streamId = getStreamId(address);
  const key = Uint8Array.from(Buffer.from(reportId, "utf-8"));

  const kvClient = new KvClient(KV_RPC);
  const val = await kvClient.getValue(streamId, key);

  if (!val) return null;

  const decoded = Buffer.from(val.data).toString("utf-8");
  return JSON.parse(decoded);
}

export function verifyReportIntegrity(
  original: PoTReport,
  retrieved: PoTReport | null
): { verified: boolean; error?: string } {
  if (!retrieved) {
    return { verified: false, error: "Report not found in KV store" };
  }

  if (retrieved.potHash !== original.potHash) {
    return {
      verified: false,
      error: `Hash mismatch: expected ${original.potHash}, got ${retrieved.potHash}`,
    };
  }

  return { verified: true };
}

export async function verifyStorageRoundTrip(
  address: string,
  report: PoTReport,
  delayMs = 2000
): Promise<{ verified: boolean; error?: string }> {
  await new Promise((r) => setTimeout(r, delayMs));

  try {
    const retrieved = await retrieveReportByKey(address, report.id);
    return verifyReportIntegrity(report, retrieved);
  } catch (err: any) {
    return { verified: false, error: err.message };
  }
}

function extractJson(raw: string): PoTReport {
  const jsonStart = raw.indexOf("{");
  if (jsonStart < 0) {
    throw new Error("No JSON found in stored blob");
  }

  let depth = 0;
  let jsonEnd = jsonStart;
  for (let i = jsonStart; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0) {
        jsonEnd = i + 1;
        break;
      }
    }
  }

  return JSON.parse(raw.slice(jsonStart, jsonEnd));
}
