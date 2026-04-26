import type { ModelConfig, ModelResponse, TEESignature } from "../types/index.js";

export async function callModel(
  broker: any,
  config: ModelConfig,
  query: string
): Promise<ModelResponse> {
  const t0 = performance.now();

  const { endpoint, model } = await broker.inference.getServiceMetadata(
    config.provider
  );
  const headers = await broker.inference.getRequestHeaders(
    config.provider,
    query
  );

  const tInferStart = performance.now();
  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content:
            "You are an expert analyst. Respond with a structured analysis. " +
            "Format your response as numbered claims, one per line. " +
            "Each claim should be a single, verifiable statement. " +
            "Keep to 5-7 claims maximum.",
        },
        { role: "user", content: query },
      ],
      model,
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${config.name} HTTP ${response.status}: ${text}`);
  }

  const data = await response.json();
  const tInferEnd = performance.now();

  const content = data.choices?.[0]?.message?.content ?? "";
  const chatID = response.headers.get("ZG-Res-Key") || data.id;

  // TEE verification
  const tVerifyStart = performance.now();
  let teeVerified: boolean | null = null;
  try {
    const usageJson = data.usage ? JSON.stringify(data.usage) : undefined;
    teeVerified = await broker.inference.processResponse(
      config.provider,
      chatID,
      usageJson
    );
  } catch {
    teeVerified = null;
  }
  const tVerifyEnd = performance.now();

  // Fetch the per-chat TEE signature
  const tSigStart = performance.now();
  let teeSignature: TEESignature | null = null;
  try {
    const sigLink = await broker.inference.getChatSignatureDownloadLink(
      config.provider,
      chatID
    );
    const sigResp = await fetch(sigLink);
    if (sigResp.ok) {
      teeSignature = await sigResp.json();
    }
  } catch {
    // signature fetch is best-effort
  }
  const tSigEnd = performance.now();

  const attestationUrl = `${endpoint.replace("/v1/proxy", "")}/v1/proxy/attestation/report`;

  return {
    model: config.name,
    provider: config.provider,
    content,
    chatID,
    teeSignature,
    teeVerified,
    attestationUrl,
    timestamp: new Date().toISOString(),
    timings: {
      inference: tInferEnd - tInferStart,
      verification: tVerifyEnd - tVerifyStart,
      signatureFetch: tSigEnd - tSigStart,
      total: tSigEnd - t0,
    },
  };
}

export async function callModelsParallel(
  broker: any,
  models: ModelConfig[],
  query: string
): Promise<ModelResponse[]> {
  const results = await Promise.allSettled(
    models.map((m) => callModel(broker, m, query))
  );

  const responses: ModelResponse[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      responses.push(r.value);
    } else {
      console.error(`Model call failed: ${r.reason}`);
    }
  }
  return responses;
}
