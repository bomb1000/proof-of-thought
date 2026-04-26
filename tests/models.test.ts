import { describe, it, expect, vi, beforeEach } from "vitest";
import { callModel, callModelsParallel } from "../src/consensus/models.js";
import type { ModelConfig } from "../src/types/index.js";

function makeMockBroker(options?: {
  content?: string;
  chatID?: string;
  teeValid?: boolean | null;
  httpStatus?: number;
  signature?: any;
}) {
  const {
    content = "1. Smart contract risk\n2. Liquidation risk\n3. Oracle risk",
    chatID = "test-chat-id",
    teeValid = true,
    httpStatus = 200,
    signature = null,
  } = options ?? {};

  const mockResponse = {
    ok: httpStatus === 200,
    status: httpStatus,
    headers: new Headers({ "ZG-Res-Key": chatID }),
    json: async () => ({
      id: chatID,
      choices: [{ message: { role: "assistant", content } }],
      usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
    }),
    text: async () => "error",
  };

  const sigResponse = {
    ok: signature !== null,
    json: async () => signature,
  };

  vi.stubGlobal(
    "fetch",
    vi.fn()
      .mockResolvedValueOnce(mockResponse) // inference call
      .mockResolvedValueOnce(sigResponse)  // signature fetch
  );

  return {
    inference: {
      getServiceMetadata: vi.fn().mockResolvedValue({
        endpoint: "https://compute.example.com/v1/proxy",
        model: "test-model",
      }),
      getRequestHeaders: vi.fn().mockResolvedValue({
        "X-ZG-Auth": "token",
      }),
      processResponse: vi.fn().mockResolvedValue(teeValid),
      getChatSignatureDownloadLink: vi.fn().mockResolvedValue(
        "https://compute.example.com/signatures/test"
      ),
    },
  };
}

const TEST_CONFIG: ModelConfig = {
  name: "test-model",
  provider: "0xTestProvider",
};

describe("callModel", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns a ModelResponse with TEE verification", async () => {
    const broker = makeMockBroker();
    const result = await callModel(broker, TEST_CONFIG, "test query");

    expect(result.model).toBe("test-model");
    expect(result.provider).toBe("0xTestProvider");
    expect(result.teeVerified).toBe(true);
    expect(result.content).toContain("Smart contract risk");
    expect(result.chatID).toBe("test-chat-id");
    expect(result.timestamp).toBeTruthy();
  });

  it("includes system prompt for structured claims", async () => {
    const broker = makeMockBroker();
    await callModel(broker, TEST_CONFIG, "test query");

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]!.body as string);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("numbered claims");
    expect(body.messages[1].content).toBe("test query");
  });

  it("handles TEE verification failure gracefully", async () => {
    const broker = makeMockBroker();
    broker.inference.processResponse.mockRejectedValue(new Error("TEE failed"));

    const result = await callModel(broker, TEST_CONFIG, "query");
    expect(result.teeVerified).toBeNull();
    expect(result.content).toBeTruthy();
  });

  it("throws on HTTP error", async () => {
    const broker = makeMockBroker({ httpStatus: 500 });
    await expect(callModel(broker, TEST_CONFIG, "query")).rejects.toThrow("HTTP 500");
  });

  it("records timing for all phases", async () => {
    const broker = makeMockBroker();
    const result = await callModel(broker, TEST_CONFIG, "query");

    expect(result.timings.inference).toBeGreaterThanOrEqual(0);
    expect(result.timings.verification).toBeGreaterThanOrEqual(0);
    expect(result.timings.signatureFetch).toBeGreaterThanOrEqual(0);
    expect(result.timings.total).toBeGreaterThanOrEqual(0);
  });
});

describe("callModelsParallel", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns successful responses and logs failures", async () => {
    const broker = makeMockBroker();
    const models: ModelConfig[] = [
      { name: "model-a", provider: "0xA" },
      { name: "model-b", provider: "0xB" },
    ];

    const results = await callModelsParallel(broker, models, "query");
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns empty array when all models fail", async () => {
    const broker = makeMockBroker();
    broker.inference.getServiceMetadata.mockRejectedValue(new Error("down"));

    const results = await callModelsParallel(broker, [TEST_CONFIG], "query");
    expect(results).toHaveLength(0);
  });
});
