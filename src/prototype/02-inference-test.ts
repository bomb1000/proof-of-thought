import { createRequire } from "module";
import { config } from "dotenv";

config();

const require = createRequire(import.meta.url);
const { createZGComputeNetworkBroker } = require("@0glabs/0g-serving-broker");
const { ethers } = require("ethers");

const RPC_URL = process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai";
const PRIVATE_KEY = process.env.OG_PRIVATE_KEY!;

const MODELS: Record<string, string> = {
  "qwen/qwen-2.5-7b-instruct": "0xa48f01287233509FD694a22Bf840225062E67836",
};

const QUERY = "What are the top 3 risks of lending ETH on Aave v3 right now? Be concise — 3 bullet points max.";

async function callModel(
  broker: any,
  modelName: string,
  providerAddress: string,
  query: string
) {
  const t0 = performance.now();

  console.log(`\n[${ modelName }] Getting service metadata...`);
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  console.log(`  Endpoint: ${endpoint}`);
  console.log(`  Model:    ${model}`);
  const tMeta = performance.now();
  console.log(`  Metadata: ${(tMeta - t0).toFixed(0)}ms`);

  console.log(`[${modelName}] Getting request headers...`);
  const headers = await broker.inference.getRequestHeaders(providerAddress, query);
  const tHeaders = performance.now();
  console.log(`  Headers:  ${(tHeaders - tMeta).toFixed(0)}ms`);

  console.log(`[${modelName}] Calling inference...`);
  const tInferStart = performance.now();
  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: query }],
      model,
      temperature: 0.7,
      max_tokens: 512,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const data = await response.json();
  const tInferEnd = performance.now();
  const content = data.choices?.[0]?.message?.content ?? "(no content)";
  const chatID = response.headers.get("ZG-Res-Key") || data.id;
  console.log(`  Inference: ${(tInferEnd - tInferStart).toFixed(0)}ms`);
  console.log(`  Chat ID:   ${chatID}`);
  console.log(`  Response:  ${content.slice(0, 200)}...`);

  console.log(`[${modelName}] Verifying TEE signature...`);
  const tVerifyStart = performance.now();
  let verified: boolean | null = null;
  try {
    const usageJson = data.usage ? JSON.stringify(data.usage) : undefined;
    verified = await broker.inference.processResponse(providerAddress, chatID, usageJson);
  } catch (err: any) {
    console.log(`  TEE verify error: ${err.message}`);
  }
  const tVerifyEnd = performance.now();
  console.log(`  TEE valid: ${verified}`);
  console.log(`  Verify:    ${(tVerifyEnd - tVerifyStart).toFixed(0)}ms`);

  const totalMs = tVerifyEnd - t0;
  console.log(`  TOTAL:     ${totalMs.toFixed(0)}ms`);

  return {
    model: modelName,
    provider: providerAddress,
    content,
    chatID,
    teeVerified: verified,
    timings: {
      metadata: tMeta - t0,
      headers: tHeaders - tMeta,
      inference: tInferEnd - tInferStart,
      verification: tVerifyEnd - tVerifyStart,
      total: totalMs,
    },
  };
}

async function main() {
  if (!PRIVATE_KEY) {
    console.error("Set OG_PRIVATE_KEY in .env");
    process.exit(1);
  }

  console.log("Connecting wallet to 0G testnet...");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const address = await wallet.getAddress();
  console.log(`Wallet: ${address}`);

  const balance = await provider.getBalance(address);
  console.log(`Balance: ${ethers.formatEther(balance)} 0G\n`);

  console.log("Initializing broker...");
  const broker = await createZGComputeNetworkBroker(wallet);

  const modelName = "qwen/qwen-2.5-7b-instruct";
  const providerAddr = MODELS[modelName];

  // Deposit into ledger and fund provider sub-account (one-time setup)
  console.log("Depositing 3 0G into ledger...");
  try {
    await broker.ledger.depositFund(3);
    console.log("  Deposited.");
  } catch (err: any) {
    console.log(`  Deposit note: ${err.message?.slice(0, 100)}`);
  }

  console.log(`Transferring 2 0G to provider sub-account...`);
  try {
    await broker.ledger.transferFund(providerAddr, "inference", BigInt(2n * 10n ** 18n));
    console.log("  Transferred.");
  } catch (err: any) {
    console.log(`  Transfer note: ${err.message?.slice(0, 100)}`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`SINGLE MODEL TEST: ${modelName}`);
  console.log(`Query: "${QUERY}"`);
  console.log("=".repeat(60));

  try {
    const result = await callModel(broker, modelName, providerAddr, QUERY);

    console.log(`\n${"=".repeat(60)}`);
    console.log("TIMING SUMMARY");
    console.log("=".repeat(60));
    console.log(`  Metadata fetch:    ${result.timings.metadata.toFixed(0)}ms`);
    console.log(`  Header generation: ${result.timings.headers.toFixed(0)}ms`);
    console.log(`  Inference:         ${result.timings.inference.toFixed(0)}ms`);
    console.log(`  TEE verification:  ${result.timings.verification.toFixed(0)}ms`);
    console.log(`  TOTAL:             ${result.timings.total.toFixed(0)}ms`);
    console.log(`  TEE verified:      ${result.teeVerified}`);
  } catch (err: any) {
    console.error(`\nFailed: ${err.message}`);
    if (err.message.includes("insufficient")) {
      console.log("\nYou may need to deposit funds. Try running:");
      console.log("  broker.ledger.depositFund(5)  // deposit 5 0G tokens");
      console.log(`  broker.ledger.transferFund("${providerAddr}", "inference", BigInt(1e18))`);
    }
  }
}

main().catch(console.error);
