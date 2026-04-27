import { createRequire } from "module";
import { config } from "dotenv";

config();

const require = createRequire(import.meta.url);
const { Indexer, KvClient, Batcher, getFlowContract } = require("@0gfoundation/0g-ts-sdk");
const { ethers } = require("ethers");

const EVM_RPC = "https://evmrpc-testnet.0g.ai";
const INDEXER_RPC = "https://indexer-storage-testnet-turbo.0g.ai";
const KV_RPC = "http://3.101.147.150:6789";
const PRIVATE_KEY = process.env.OG_PRIVATE_KEY!;

// A mock PoT Report to store
const SAMPLE_REPORT = {
  id: "pot-" + Date.now(),
  query: "What are the risks of lending ETH on Aave v3?",
  timestamp: new Date().toISOString(),
  proofs: [
    {
      model: "qwen/qwen-2.5-7b-instruct",
      provider: "0xa48f01287233509FD694a22Bf840225062E67836",
      response: "The top 3 risks are: smart contract risk, liquidation cascades, and oracle failures.",
      tee_verified: true,
      chat_id: "test-chat-001",
    },
  ],
  consensus: {
    agreement_score: 0.87,
    converged_claims: ["Smart contract risk is dominant"],
  },
};

async function main() {
  if (!PRIVATE_KEY) {
    console.error("Set OG_PRIVATE_KEY in .env");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(EVM_RPC);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);
  const address = await signer.getAddress();
  console.log(`Wallet: ${address}`);

  const balance = await provider.getBalance(address);
  console.log(`Balance: ${ethers.formatEther(balance)} 0G\n`);

  // Step 1: Discover storage nodes via indexer
  console.log("Discovering storage nodes via indexer...");
  const t0 = performance.now();
  const indexer = new Indexer(INDEXER_RPC);
  const [nodes, nodeErr] = await indexer.selectNodes(1);
  if (nodeErr || !nodes?.length) {
    console.error("Failed to select nodes:", nodeErr);
    process.exit(1);
  }
  console.log(`  Found ${nodes.length} node(s) in ${(performance.now() - t0).toFixed(0)}ms`);

  // Step 2: Get flow contract from node status
  console.log("Getting flow contract...");
  const status = await nodes[0].getStatus();
  const flowAddress = status.networkIdentity.flowAddress;
  console.log(`  Flow contract: ${flowAddress}`);
  const flow = getFlowContract(flowAddress, signer);

  // Step 3: Create a stream ID (deterministic from our wallet)
  // Stream ID is a bytes32 — we'll derive it from our address + "pot-reports"
  const streamId = ethers.keccak256(ethers.toUtf8Bytes(`pot-reports-${address}`));
  console.log(`  Stream ID: ${streamId}`);

  // Step 4: Write PoT Report to KV store
  console.log("\nWriting PoT Report to 0G KV Store...");
  const tWrite = performance.now();

  const batcher = new Batcher(1, nodes, flow, EVM_RPC);
  const reportKey = Uint8Array.from(Buffer.from(SAMPLE_REPORT.id, "utf-8"));
  const reportData = Uint8Array.from(Buffer.from(JSON.stringify(SAMPLE_REPORT), "utf-8"));

  batcher.streamDataBuilder.set(streamId, reportKey, reportData);

  const [txResult, txErr] = await batcher.exec();
  const tWriteDone = performance.now();

  if (txErr) {
    console.error("  Write failed:", txErr);
    process.exit(1);
  }

  console.log(`  TX Hash:   ${txResult.txHash}`);
  console.log(`  Root Hash: ${txResult.rootHash}`);
  console.log(`  Write:     ${(tWriteDone - tWrite).toFixed(0)}ms`);

  // Step 5: Read it back from KV
  console.log("\nReading PoT Report back from 0G KV Store...");
  const tRead = performance.now();

  const kvClient = new KvClient(KV_RPC);

  // Wait a bit for propagation
  console.log("  Waiting 5s for propagation...");
  await new Promise((r) => setTimeout(r, 5000));

  const val = await kvClient.getValue(streamId, reportKey);
  const tReadDone = performance.now();

  if (val) {
    const decoded = Buffer.from(val.data).toString("utf-8");
    const parsed = JSON.parse(decoded);
    console.log(`  Read back:  ${decoded.slice(0, 150)}...`);
    console.log(`  Report ID:  ${parsed.id}`);
    console.log(`  Read:       ${(tReadDone - tRead).toFixed(0)}ms (including 5s wait)`);
  } else {
    console.log("  No value found (may need more propagation time)");
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("STORAGE SUMMARY");
  console.log("=".repeat(60));
  console.log(`  Report ID:     ${SAMPLE_REPORT.id}`);
  console.log(`  Stream ID:     ${streamId}`);
  console.log(`  Root Hash:     ${txResult.rootHash}`);
  console.log(`  TX Hash:       ${txResult.txHash}`);
  console.log(`  Write time:    ${(tWriteDone - tWrite).toFixed(0)}ms`);
  console.log(`  Stored on:     0g://${txResult.rootHash}`);
}

main().catch(console.error);
