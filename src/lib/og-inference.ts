import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { createZGComputeNetworkBroker, createZGComputeNetworkReadOnlyBroker } =
  require("@0glabs/0g-serving-broker");
const { ethers } = require("ethers");

export interface ModelConfig {
  name: string;
  providerAddress: string;
}

export interface InferenceResult {
  model: string;
  provider: string;
  content: string;
  chatID: string;
  teeVerified: boolean | null;
  timings: {
    metadata: number;
    headers: number;
    inference: number;
    verification: number;
    total: number;
  };
}

export interface ServiceInfo {
  provider: string;
  model: string;
  serviceType: string;
  url: string;
  inputPrice: string;
  outputPrice: string;
}

export async function listServices(rpcUrl: string): Promise<ServiceInfo[]> {
  const broker = await createZGComputeNetworkReadOnlyBroker(rpcUrl);
  const services = await broker.inference.listService();
  return services.map((svc: any) => ({
    provider: svc.provider,
    model: svc.model,
    serviceType: svc.serviceType,
    url: svc.url,
    inputPrice: svc.inputPrice?.toString() ?? "0",
    outputPrice: svc.outputPrice?.toString() ?? "0",
  }));
}

export async function createBroker(rpcUrl: string, privateKey: string) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const address = await wallet.getAddress();
  const balance = await provider.getBalance(address);
  const broker = await createZGComputeNetworkBroker(wallet);
  return {
    broker,
    address,
    balance: ethers.formatEther(balance),
  };
}

export async function setupProviderFunding(
  broker: any,
  providerAddress: string,
  depositAmount: number = 3,
  transferAmount: bigint = 2n * 10n ** 18n
): Promise<void> {
  await broker.ledger.depositFund(depositAmount);
  await broker.ledger.transferFund(providerAddress, "inference", transferAmount);
}

export async function callModel(
  broker: any,
  model: ModelConfig,
  query: string
): Promise<InferenceResult> {
  const t0 = performance.now();

  const { endpoint, model: modelId } =
    await broker.inference.getServiceMetadata(model.providerAddress);
  const tMeta = performance.now();

  const headers = await broker.inference.getRequestHeaders(
    model.providerAddress,
    query
  );
  const tHeaders = performance.now();

  const tInferStart = performance.now();
  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      messages: [{ role: "user", content: query }],
      model: modelId,
      temperature: 0.7,
      max_tokens: 512,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Inference failed (HTTP ${response.status}): ${text}`);
  }

  const data = await response.json();
  const tInferEnd = performance.now();

  const content = data.choices?.[0]?.message?.content ?? "(no content)";
  const chatID = response.headers.get("ZG-Res-Key") || data.id;

  const tVerifyStart = performance.now();
  let verified: boolean | null = null;
  try {
    const usageJson = data.usage ? JSON.stringify(data.usage) : undefined;
    verified = await broker.inference.processResponse(
      model.providerAddress,
      chatID,
      usageJson
    );
  } catch {
    verified = null;
  }
  const tVerifyEnd = performance.now();

  return {
    model: model.name,
    provider: model.providerAddress,
    content,
    chatID,
    teeVerified: verified,
    timings: {
      metadata: tMeta - t0,
      headers: tHeaders - tMeta,
      inference: tInferEnd - tInferStart,
      verification: tVerifyEnd - tVerifyStart,
      total: tVerifyEnd - t0,
    },
  };
}

export async function callModelsParallel(
  broker: any,
  models: ModelConfig[],
  query: string
): Promise<InferenceResult[]> {
  return Promise.all(models.map((m) => callModel(broker, m, query)));
}
