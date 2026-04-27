import type { PoTReport } from "../types/index.js";
import { callModelsParallel } from "./models.js";
import { buildConsensus } from "./comparator.js";
import { buildReport, formatReport } from "./report.js";
import { storeReport, verifyStorageRoundTrip } from "../storage/store.js";
import {
  registerReportOnChain,
  getRegistryAddress,
} from "../contracts/registry.js";
import { TESTNET_MODELS, MAINNET_MODELS } from "../config/models.js";
import { getInfra } from "../config/infra.js";

export async function runConsensus(
  query: string,
  options?: { store?: boolean; network?: "testnet" | "mainnet" }
): Promise<PoTReport> {
  const network = options?.network ?? "testnet";
  const shouldStore = options?.store ?? true;

  const infra = await getInfra(network);

  console.log(`\nWallet:  ${infra.address}`);
  console.log(`Balance: ${infra.balance} 0G`);
  console.log(`Network: ${network}\n`);

  const models = network === "mainnet" ? MAINNET_MODELS : TESTNET_MODELS;

  // Step 1: Call models
  console.log(`Dispatching query to ${models.length} model(s)...`);
  const t0 = performance.now();
  const responses = await callModelsParallel(infra.broker, models, query);
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
      const { txHash, rootHash } = await storeReport(report, infra.rpcUrl, infra.wallet);
      report.storedOn = `0g://${rootHash}`;
      const tStore = performance.now();
      console.log(`Stored in ${((tStore - tConsensus) / 1000).toFixed(1)}s`);
      console.log(`  TX:   ${txHash}`);
      console.log(`  Root: ${rootHash}`);

      // Verify storage round-trip
      console.log("Verifying storage retrieval...");
      const verification = await verifyStorageRoundTrip(infra.address, report);
      if (verification.verified) {
        console.log("  Storage verified: potHash matches\n");
      } else {
        console.error(`  Storage verification failed: ${verification.error}\n`);
      }

      // Register on-chain if registry is configured
      if (getRegistryAddress()) {
        console.log("Registering report on 0G Chain...");
        try {
          const chainResult = await registerReportOnChain(
            report.potHash,
            rootHash,
            infra.wallet
          );
          console.log(`  Chain TX:    ${chainResult.txHash}`);
          console.log(`  Block:       ${chainResult.blockNumber}\n`);
        } catch (chainErr: any) {
          console.error(`  On-chain registration failed: ${chainErr.message}\n`);
        }
      }
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
