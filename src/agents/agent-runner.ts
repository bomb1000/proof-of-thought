import { createRequire } from "module";
import { config } from "dotenv";

config();

const require = createRequire(import.meta.url);
const { createZGComputeNetworkBroker } = require("@0glabs/0g-serving-broker");
const { ethers } = require("ethers");

import { AXLClient, type AXLNodeConfig } from "./axl-client.js";
import { parseAgentMessage, type ResponseMessage, type QueryMessage } from "./dispatcher.js";
import { callModel } from "../consensus/models.js";
import type { ModelConfig } from "../types/index.js";

export interface AgentConfig {
  name: string;
  node: AXLNodeConfig;
  model: ModelConfig;
  network: "testnet" | "mainnet";
}

export async function runAgent(agentConfig: AgentConfig): Promise<void> {
  const { name, node, model, network } = agentConfig;

  const rpcUrl =
    network === "mainnet"
      ? "https://evmrpc.0g.ai"
      : "https://evmrpc-testnet.0g.ai";

  const privateKey = process.env.OG_PRIVATE_KEY;
  if (!privateKey) throw new Error("OG_PRIVATE_KEY not set");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const client = new AXLClient(node);
  const topology = await client.topology();

  console.log(`[${name}] Agent started`);
  console.log(`  Node:     ${node.host}:${node.port}`);
  console.log(`  Peer ID:  ${topology.ourPublicKey}`);
  console.log(`  Model:    ${model.name}`);
  console.log(`  Peers:    ${topology.peers.length}`);
  console.log(`  Listening for queries...\n`);

  while (true) {
    try {
      const messages = await client.recv();

      for (const msg of messages) {
        const parsed = parseAgentMessage(msg.data ?? JSON.stringify(msg));
        if (parsed?.type !== "query") continue;

        const query = parsed as QueryMessage;
        console.log(`[${name}] Received query: "${query.query.slice(0, 80)}..."`);
        console.log(`  Request ID: ${query.requestId}`);

        try {
          const result = await callModel(broker, model, query.query);

          const response: ResponseMessage = {
            type: "response",
            requestId: query.requestId,
            model: result.model,
            provider: result.provider,
            content: result.content,
            chatID: result.chatID,
            teeVerified: result.teeVerified,
            teeSignature: result.teeSignature,
            timestamp: new Date().toISOString(),
          };

          await client.send(msg.from, JSON.stringify(response));
          console.log(`[${name}] Response sent (TEE verified: ${result.teeVerified})\n`);
        } catch (err: any) {
          console.error(`[${name}] Inference failed: ${err.message}\n`);
        }
      }
    } catch {
      // recv polling failure — retry
    }

    await new Promise((r) => setTimeout(r, 500));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.argv[2] || "9002");
  const modelName = process.argv[3] || "qwen/qwen-2.5-7b-instruct";
  const providerAddr = process.argv[4] || "0xa48f01287233509FD694a22Bf840225062E67836";
  const agentName = process.argv[5] || `agent-${port}`;

  runAgent({
    name: agentName,
    node: { host: "http://127.0.0.1", port },
    model: { name: modelName, provider: providerAddr },
    network: "testnet",
  }).catch((err) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}
