import { createRequire } from "module";
import { config } from "dotenv";

config();

const require = createRequire(import.meta.url);
const { createZGComputeNetworkBroker } = require("@0glabs/0g-serving-broker");
const { ethers } = require("ethers");

import type { ModelConfig, PoTReport } from "../types/index.js";
import { callModelsParallel } from "./models.js";
import { buildConsensus } from "./comparator.js";
import { buildReport, formatReport } from "./report.js";
import { storeReport } from "../storage/store.js";

const TESTNET_MODELS: ModelConfig[] = [
  {
    name: "qwen/qwen-2.5-7b-instruct",
    provider: "0xa48f01287233509FD694a22Bf840225062E67836",
  },
];

const MAINNET_MODELS: ModelConfig[] = [
  {
    name: "deepseek/deepseek-chat-v3-0324",
    provider: "0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0",
  },
  {
    name: "zai-org/GLM-5-FP8",
    provider: "0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C",
  },
  {
    name: "qwen3.6-plus",
    provider: "0x992e6396157Dc4f22E74F2231235D7DE62696db5",
  },
];

export async function runConsensus(
  query: string,
  options?: { store?: boolean; network?: "testnet" | "mainnet" }
): Promise<PoTReport> {
  const network = options?.network ?? "testnet";
  const shouldStore = options?.store ?? true;

  const rpcUrl =
    network === "mainnet"
      ? "https://evmrpc.0g.ai"
      : "https://evmrpc-testnet.0g.ai";

  const privateKey = process.env.OG_PRIVATE_KEY;
  if (!privateKey) throw new Error("OG_PRIVATE_KEY not set");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const address = await wallet.getAddress();

  console.log(`\nWallet:  ${address}`);
  const balance = await provider.getBalance(address);
  console.log(`Balance: ${ethers.formatEther(balance)} 0G`);
  console.log(`Network: ${network}\n`);

  const broker = await createZGComputeNetworkBroker(wallet);
  const models = network === "mainnet" ? MAINNET_MODELS : TESTNET_MODELS;

  // Step 1: Call models
  console.log(`Dispatching query to ${models.length} model(s)...`);
  const t0 = performance.now();
  const responses = await callModelsParallel(broker, models, query);
  const tModels = performance.now();
  console.log(
    `Models responded in ${((tModels - t0) / 1000).toFixed(1)}s (${responses.length}/${models.length} succeeded)\n`
  );

  if (responses.length === 0) {
    throw new Error("No models responded successfully");
  }

  // Step 2: Build consensus
  console.log("Building consensus...");
  const consensus = buildConsensus(responses);
  const tConsensus = performance.now();
  console.log(
    `Consensus built in ${(tConsensus - tModels).toFixed(0)}ms — agreement: ${(consensus.agreementScore * 100).toFixed(1)}%\n`
  );

  // Step 3: Build report
  const report = buildReport(query, responses, consensus);

  // Step 4: Store on 0G
  if (shouldStore) {
    console.log("Storing PoT Report on 0G Storage...");
    try {
      const { txHash, rootHash } = await storeReport(report, rpcUrl, wallet);
      report.storedOn = `0g://${rootHash}`;
      const tStore = performance.now();
      console.log(`Stored in ${((tStore - tConsensus) / 1000).toFixed(1)}s`);
      console.log(`  TX:   ${txHash}`);
      console.log(`  Root: ${rootHash}\n`);
    } catch (err: any) {
      console.error(`Storage failed: ${err.message}\n`);
    }
  }

  // Print formatted report
  console.log(formatReport(report));

  const totalTime = performance.now() - t0;
  console.log(`\nTotal pipeline: ${(totalTime / 1000).toFixed(1)}s`);

  return report;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const query =
    process.argv[2] ||
    "What are the top 3 risks of lending ETH on Aave v3 right now?";

  const network = (process.argv[3] as "testnet" | "mainnet") || "testnet";
  const store = process.argv[4] !== "--no-store";

  console.log("═".repeat(60));
  console.log("  PROOF OF THOUGHT — Consensus Engine");
  console.log("═".repeat(60));
  console.log(`\nQuery: "${query}"`);

  runConsensus(query, { network, store })
    .then((report) => {
      console.log(`\nReport ID: ${report.id}`);
      console.log(`PoT Hash:  ${report.potHash}`);
      if (report.storedOn) {
        console.log(`Stored:    ${report.storedOn}`);
      }
    })
    .catch((err) => {
      console.error(`\nFatal: ${err.message}`);
      process.exit(1);
    });
}
