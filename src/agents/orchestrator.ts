import { createRequire } from "module";
import { config } from "dotenv";

config();

const require = createRequire(import.meta.url);
const { ethers } = require("ethers");

import { AXLClient, type AXLNodeConfig } from "./axl-client.js";
import { dispatchQuery, collectResponses, type ResponseMessage } from "./dispatcher.js";
import { buildConsensus } from "../consensus/comparator.js";
import { buildReport, formatReport } from "../consensus/report.js";
import { storeReport } from "../storage/store.js";
import type { ModelResponse, PoTReport } from "../types/index.js";

export interface OrchestratorConfig {
  coordinatorNode: AXLNodeConfig;
  agentPeerIds: string[];
  network: "testnet" | "mainnet";
  store: boolean;
}

function responseMessageToModelResponse(msg: ResponseMessage): ModelResponse {
  return {
    model: msg.model,
    provider: msg.provider,
    content: msg.content,
    chatID: msg.chatID,
    teeSignature: msg.teeSignature ?? null,
    teeVerified: msg.teeVerified,
    attestationUrl: "",
    timestamp: msg.timestamp,
    timings: { inference: 0, verification: 0, signatureFetch: 0, total: 0 },
  };
}

export async function runP2PConsensus(
  query: string,
  orchestratorConfig: OrchestratorConfig
): Promise<PoTReport> {
  const { coordinatorNode, agentPeerIds, network, store } = orchestratorConfig;

  const rpcUrl =
    network === "mainnet"
      ? "https://evmrpc.0g.ai"
      : "https://evmrpc-testnet.0g.ai";

  const client = new AXLClient(coordinatorNode);
  const topology = await client.topology();

  console.log(`\nCoordinator: ${coordinatorNode.host}:${coordinatorNode.port}`);
  console.log(`Peer ID:     ${topology.ourPublicKey}`);
  console.log(`Agents:      ${agentPeerIds.length}`);
  console.log(`Network:     ${network}\n`);

  // Step 1: Dispatch query to all agent peers
  console.log(`Dispatching query to ${agentPeerIds.length} agent(s) over AXL P2P...`);
  const t0 = performance.now();
  const queryMsg = await dispatchQuery(client, agentPeerIds, query);
  console.log(`  Request ID: ${queryMsg.requestId}\n`);

  // Step 2: Collect TEE-verified responses
  console.log("Waiting for agent responses...");
  const responseMessages = await collectResponses(
    client,
    queryMsg.requestId,
    agentPeerIds.length,
    60000
  );
  const tResponses = performance.now();
  console.log(
    `Received ${responseMessages.length}/${agentPeerIds.length} responses in ${((tResponses - t0) / 1000).toFixed(1)}s\n`
  );

  if (responseMessages.length === 0) {
    throw new Error("No agent responses received");
  }

  const responses = responseMessages.map(responseMessageToModelResponse);

  // Step 3: Build consensus
  console.log("Building consensus...");
  const consensus = buildConsensus(responses);
  const tConsensus = performance.now();
  console.log(
    `Consensus: ${(consensus.agreementScore * 100).toFixed(1)}% agreement (${(tConsensus - tResponses).toFixed(0)}ms)\n`
  );

  // Step 4: Build report
  const report = buildReport(query, responses, consensus);

  // Step 5: Store on 0G
  if (store) {
    const privateKey = process.env.OG_PRIVATE_KEY;
    if (privateKey) {
      console.log("Storing PoT Report on 0G Storage...");
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(privateKey, provider);
        const { rootHash } = await storeReport(report, rpcUrl, wallet);
        report.storedOn = `0g://${rootHash}`;
        console.log(`  Stored: ${report.storedOn}\n`);
      } catch (err: any) {
        console.error(`  Storage failed: ${err.message}\n`);
      }
    }
  }

  console.log(formatReport(report));

  const totalTime = performance.now() - t0;
  console.log(`\nTotal P2P pipeline: ${(totalTime / 1000).toFixed(1)}s`);

  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const query =
    process.argv[2] ||
    "What are the top 3 risks of lending ETH on Aave v3 right now?";

  const peerIds = (process.argv[3] || "").split(",").filter(Boolean);

  if (peerIds.length === 0) {
    console.error("Usage: npx tsx orchestrator.ts <query> <peer1,peer2,...>");
    console.error("  Get peer IDs from: curl http://127.0.0.1:9002/topology");
    process.exit(1);
  }

  console.log("═".repeat(60));
  console.log("  PROOF OF THOUGHT — P2P Consensus");
  console.log("═".repeat(60));
  console.log(`\nQuery: "${query}"`);

  runP2PConsensus(query, {
    coordinatorNode: { host: "http://127.0.0.1", port: 9002 },
    agentPeerIds: peerIds,
    network: "testnet",
    store: true,
  })
    .then((report) => {
      console.log(`\nReport ID: ${report.id}`);
      console.log(`PoT Hash:  ${report.potHash}`);
    })
    .catch((err) => {
      console.error(`\nFatal: ${err.message}`);
      process.exit(1);
    });
}
