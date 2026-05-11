import { createRequire } from "module";
import { performance } from "node:perf_hooks";
import { config } from "dotenv";

config();

const require = createRequire(import.meta.url);
const { ethers } = require("ethers");
const express = require("express");
const cors = require("cors");
const { paymentMiddleware } = require("x402-express");

import type { ModelResponse, PoTReport } from "../types/index.js";
import { callModel } from "../consensus/models.js";
import { buildConsensus } from "../consensus/comparator.js";
import { buildReport } from "../consensus/report.js";
import { storeReport, verifyStorageRoundTrip } from "../storage/store.js";
import {
  registerReportOnChain,
  getRegistryAddress,
} from "../contracts/registry.js";
import {
  TESTNET_MODELS,
  MAINNET_MODELS,
  AGENT_NAMES,
} from "../config/models.js";
import { getInfra } from "../config/infra.js";
import { AuditTrailStore, buildPaymentAuditRecord } from "../commerce/audit.js";
import { buildKeeperHubExecutionPlan } from "../commerce/keeperhub.js";

const MAX_REPORTS = 100;
const MAX_AUDIT_RECORDS = 1000;
const reportStore = new Map<string, PoTReport>();
const auditTrail = new AuditTrailStore(MAX_AUDIT_RECORDS);
const REPORT_PRICE = process.env.X402_REPORT_PRICE ?? "$0.01";
const X402_NETWORK = process.env.X402_NETWORK ?? "base-sepolia";
const KEEPERHUB_MAX_RETRIES = Number.parseInt(
  process.env.KEEPERHUB_MAX_RETRIES ?? "3",
  10,
);
const KEEPERHUB_GAS_MULTIPLIER = Number.parseFloat(
  process.env.KEEPERHUB_GAS_MULTIPLIER ?? "1.3",
);

function addReport(id: string, report: PoTReport) {
  if (reportStore.size >= MAX_REPORTS) {
    const oldest = reportStore.keys().next().value;
    if (oldest !== undefined) reportStore.delete(oldest);
  }
  reportStore.set(id, report);
}

let PAYMENT_ADDRESS: string = process.env.PAYMENT_ADDRESS ?? "";
if (!PAYMENT_ADDRESS && process.env.OG_PRIVATE_KEY) {
  try {
    const w = new ethers.Wallet(process.env.OG_PRIVATE_KEY);
    PAYMENT_ADDRESS = w.address as string;
  } catch (err: any) {
    console.warn(
      `Failed to derive payment address from OG_PRIVATE_KEY: ${err.message}`,
    );
  }
}

const FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

if (PAYMENT_ADDRESS) {
  app.use(
    paymentMiddleware(
      PAYMENT_ADDRESS,
      {
        "/api/report/:id": {
          price: REPORT_PRICE,
          network: X402_NETWORK,
          config: {
            description: "Access to TEE-verified PoT Report",
          },
        },
      },
      { url: FACILITATOR_URL },
    ),
  );
} else {
  console.warn("No valid PAYMENT_ADDRESS — x402 payment middleware disabled");
}

app.get("/api/reports", (_req: any, res: any) => {
  const reports = Array.from(reportStore.entries()).map(([id, r]) => ({
    id,
    query: r.query,
    timestamp: r.timestamp,
    consensusScore: r.consensus.agreementScore,
    modelCount: r.responses.length,
    potHash: r.potHash,
    storedOn: r.storedOn,
  }));
  res.json({
    reports,
    paymentInfo: { price: REPORT_PRICE, network: X402_NETWORK },
  });
});

app.get("/api/report/:id", (req: any, res: any) => {
  const report = reportStore.get(req.params.id);
  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  const auditRecord = auditTrail.add(
    buildPaymentAuditRecord({
      report,
      getHeader: (name) => req.get(name) as string | undefined,
      ipAddress: req.ip as string | undefined,
      amount: REPORT_PRICE,
      network: X402_NETWORK,
      payTo: PAYMENT_ADDRESS,
      route: `/api/report/${report.id}`,
    }),
  );
  const keeperHubPlan = buildKeeperHubExecutionPlan(
    {
      reportId: report.id,
      amount: REPORT_PRICE,
      network: X402_NETWORK,
      payTo: PAYMENT_ADDRESS ? PAYMENT_ADDRESS : null,
      paymentHeaderHash: auditRecord.paymentHeaderHash,
      paymentTxHash: auditRecord.paymentTxHash,
    },
    {
      maxRetries: KEEPERHUB_MAX_RETRIES,
      gasMultiplier: KEEPERHUB_GAS_MULTIPLIER,
    },
  );

  res.json({
    report,
    receipt: {
      reportId: report.id,
      potHash: report.potHash,
      amount: REPORT_PRICE,
      network: X402_NETWORK,
      payTo: PAYMENT_ADDRESS ? PAYMENT_ADDRESS : null,
      proofChain: report.proofChain,
      consensusScore: report.consensus.agreementScore,
      timestamp: report.timestamp,
      auditRecordId: auditRecord.id,
      paymentHeaderHash: auditRecord.paymentHeaderHash,
      teeProofHashes: auditRecord.teeProofHashes,
      keeperHub: keeperHubPlan,
    },
  });
});

app.get("/api/audit", (_req: any, res: any) => {
  res.json({ auditTrail: auditTrail.list() });
});

app.get("/api/audit/report/:id", (req: any, res: any) => {
  res.json({ auditTrail: auditTrail.forReport(req.params.id) });
});

app.get("/api/status", async (_req: any, res: any) => {
  try {
    const network =
      (_req.query?.network as string as "testnet" | "mainnet") || "testnet";
    const info = await getInfra(network);
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
      network,
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

  let clientDisconnected = false;
  res.on("close", () => {
    clientDisconnected = true;
  });

  function sendEvent(event: string, data: any) {
    if (clientDisconnected) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  try {
    const info = await getInfra(network);
    const models = network === "mainnet" ? MAINNET_MODELS : TESTNET_MODELS;

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
        const response = await callModel(info.broker, m, query);
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
        info.wallet,
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
      const verification = await verifyStorageRoundTrip(info.address, report);
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
            info.wallet,
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

    addReport(report.id, report);

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
      reportUrl: `/api/report/${report.id}`,
      paymentInfo: {
        price: REPORT_PRICE,
        network: X402_NETWORK,
        payTo: PAYMENT_ADDRESS,
      },
    });
  } catch (err: any) {
    sendEvent("error", { message: err.message });
  }

  res.end();
});

const PORT = process.env.API_PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`PoT API server listening on http://localhost:${PORT}`);
});
