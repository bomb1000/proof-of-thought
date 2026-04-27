import { createRequire } from "module";
import { config } from "dotenv";

config();

const require = createRequire(import.meta.url);
const { createZGComputeNetworkBroker } = require("@0glabs/0g-serving-broker");
const { ethers } = require("ethers");
const express = require("express");
const cors = require("cors");

import type { ModelConfig, ModelResponse } from "../types/index.js";
import { callModel } from "../consensus/models.js";
import { buildConsensus } from "../consensus/comparator.js";
import { buildReport } from "../consensus/report.js";
import { storeReport, verifyStorageRoundTrip } from "../storage/store.js";
import {
  registerReportOnChain,
  getRegistryAddress,
} from "../contracts/registry.js";

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

const AGENT_NAMES: Record<string, string> = {
  "qwen/qwen-2.5-7b-instruct": "Agent Alpha",
  "deepseek/deepseek-chat-v3-0324": "Agent Beta",
  "zai-org/GLM-5-FP8": "Agent Gamma",
  "qwen3.6-plus": "Agent Alpha",
};

function getRpcUrl(network: "testnet" | "mainnet"): string {
  return network === "mainnet"
    ? "https://evmrpc.0g.ai"
    : "https://evmrpc-testnet.0g.ai";
}

async function getWalletInfo(network: "testnet" | "mainnet") {
  const privateKey = process.env.OG_PRIVATE_KEY;
  if (!privateKey) throw new Error("OG_PRIVATE_KEY not set");

  const rpcUrl = getRpcUrl(network);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const address = await wallet.getAddress();
  const balance = await provider.getBalance(address);

  return {
    address,
    balance: ethers.formatEther(balance),
    network,
    wallet,
    provider,
    rpcUrl,
  };
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get("/api/status", async (_req: any, res: any) => {
  try {
    const network =
      ((_req.query?.network as string) as "testnet" | "mainnet") || "testnet";
    const info = await getWalletInfo(network);
    const models = network === "mainnet" ? MAINNET_MODELS : TESTNET_MODELS;

    const agents = models.map((m) => ({
      name: AGENT_NAMES[m.name] || m.name,
      model: m.name,
      provider: m.provider,
      status: "idle" as const,
    }));

    res.json({
      wallet: info.address,
      balance: info.balance,
      network: info.network,
      agents,
      registryAddress: getRegistryAddress(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/consensus", async (req: any, res: any) => {
  const { query, network: netParam } = req.body;
  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  const network = (netParam as "testnet" | "mainnet") || "testnet";

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  function sendEvent(event: string, data: any) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  try {
    const info = await getWalletInfo(network);
    const models = network === "mainnet" ? MAINNET_MODELS : TESTNET_MODELS;
    const broker = await createZGComputeNetworkBroker(info.wallet);

    sendEvent("pipeline_started", {
      query,
      network,
      wallet: info.address,
      balance: info.balance,
      modelCount: models.length,
    });

    // Notify which agents are thinking
    for (const m of models) {
      sendEvent("agent_thinking", {
        name: AGENT_NAMES[m.name] || m.name,
        model: m.name,
        provider: m.provider,
      });
    }

    // Call models one at a time so we can stream per-agent events
    const responses: ModelResponse[] = [];
    const t0 = performance.now();

    for (const m of models) {
      const agentName = AGENT_NAMES[m.name] || m.name;
      try {
        const response = await callModel(broker, m, query);
        responses.push(response);
        sendEvent("agent_responded", {
          name: agentName,
          model: response.model,
          provider: response.provider,
          content: response.content,
          chatID: response.chatID,
          teeVerified: response.teeVerified,
          teeSignature: response.teeSignature,
          attestationUrl: response.attestationUrl,
          timings: response.timings,
          timestamp: response.timestamp,
        });
      } catch (err: any) {
        sendEvent("agent_error", {
          name: agentName,
          model: m.name,
          error: err.message,
        });
      }
    }

    const tModels = performance.now();

    if (responses.length === 0) {
      sendEvent("error", { message: "No models responded successfully" });
      res.end();
      return;
    }

    // Build consensus
    const consensus = buildConsensus(responses);
    const tConsensus = performance.now();

    sendEvent("consensus_reached", {
      agreementScore: consensus.agreementScore,
      convergedClaims: consensus.convergedClaims,
      divergences: consensus.divergences,
      timings: {
        models: tModels - t0,
        consensus: tConsensus - tModels,
      },
    });

    // Build report
    const report = buildReport(query, responses, consensus);

    sendEvent("report_built", {
      id: report.id,
      potHash: report.potHash,
      proofChain: report.proofChain,
    });

    // Store on 0G
    try {
      const { txHash, rootHash } = await storeReport(
        report,
        info.rpcUrl,
        info.wallet
      );
      report.storedOn = `0g://${rootHash}`;
      const tStore = performance.now();

      sendEvent("stored", {
        txHash,
        rootHash,
        storedOn: report.storedOn,
        duration: tStore - tConsensus,
      });

      // Verify storage
      const verification = await verifyStorageRoundTrip(
        info.address,
        report
      );
      sendEvent("storage_verified", {
        verified: verification.verified,
        error: verification.error,
      });

      // Register on-chain
      if (getRegistryAddress()) {
        try {
          const chainResult = await registerReportOnChain(
            report.potHash,
            rootHash,
            info.wallet
          );
          sendEvent("chain_registered", {
            txHash: chainResult.txHash,
            blockNumber: chainResult.blockNumber,
          });
        } catch (chainErr: any) {
          sendEvent("chain_error", {
            error: chainErr.message,
          });
        }
      }
    } catch (storeErr: any) {
      sendEvent("store_error", {
        error: storeErr.message,
      });
    }

    const totalTime = performance.now() - t0;
    sendEvent("report_complete", {
      report: {
        id: report.id,
        query: report.query,
        timestamp: report.timestamp,
        potHash: report.potHash,
        storedOn: report.storedOn,
        consensus: report.consensus,
        proofChain: report.proofChain,
        responses: report.responses,
      },
      totalTime,
    });
  } catch (err: any) {
    sendEvent("error", { message: err.message });
  }

  res.end();
});

const PORT = process.env.API_PORT || 3001;
app.listen(PORT, () => {
  console.log(`PoT API server listening on http://localhost:${PORT}`);
});
