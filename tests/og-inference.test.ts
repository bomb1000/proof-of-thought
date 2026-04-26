import { describe, it, expect, vi, beforeEach } from "vitest";
import { callModel, callModelsParallel, type ModelConfig } from "../src/lib/og-inference.js";

function makeMockBroker(options?: {
  content?: string;
  chatID?: string;
  teeValid?: boolean | null;
  httpStatus?: number;
}) {
  const {
    content = "Risk 1: Smart contract vulnerabilities\nRisk 2: Liquidation cascades",
    chatID = "test-chat-id-123",
    teeValid = true,
    httpStatus = 200,
  } = options ?? {};

  const mockResponse = {
    ok: httpStatus === 200,
    status: httpStatus,
    headers: new Headers({ "ZG-Res-Key": chatID }),
    json: async () => ({
      id: chatID,
      choices: [{ message: { role: "assistant", content } }],
      usage: { prompt_tokens: 20, completion_tokens: 50, total_tokens: 70 },
    }),
    text: async () => "error body",
  };

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

  return {
    inference: {
      getServiceMetadata: vi.fn().mockResolvedValue({
        endpoint: "https://compute-test.example.com/v1/proxy",
        model: "qwen/qwen-2.5-7b-instruct",
      }),
      getRequestHeaders: vi.fn().mockResolvedValue({
        "X-ZG-Auth": "mock-auth-token",
        "X-ZG-Nonce": "12345",
      }),
      processResponse: vi.fn().mockResolvedValue(teeValid),
    },
  };
}

const TEST_MODEL: ModelConfig = {
  name: "qwen/qwen-2.5-7b-instruct",
  providerAddress: "0xa48f01287233509FD694a22Bf840225062E67836",
};

const TEST_QUERY = "What are the risks of lending ETH on Aave v3?";

describe("callModel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a complete InferenceResult with TEE verification", async () => {
    const broker = makeMockBroker();
    const result = await callModel(broker, TEST_MODEL, TEST_QUERY);

    expect(result.model).toBe(TEST_MODEL.name);
    expect(result.provider).toBe(TEST_MODEL.providerAddress);
    expect(result.content).toContain("Smart contract vulnerabilities");
    expect(result.chatID).toBe("test-chat-id-123");
    expect(result.teeVerified).toBe(true);
    expect(result.timings.total).toBeGreaterThan(0);
  });

  it("calls the correct endpoint with OpenAI-compatible format", async () => {
    const broker = makeMockBroker();
    await callModel(broker, TEST_MODEL, TEST_QUERY);

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    expect(fetchCall[0]).toBe(
      "https://compute-test.example.com/v1/proxy/chat/completions"
    );

    const body = JSON.parse(fetchCall[1]!.body as string);
    expect(body.messages).toEqual([{ role: "user", content: TEST_QUERY }]);
    expect(body.model).toBe("qwen/qwen-2.5-7b-instruct");
    expect(body.max_tokens).toBe(512);
  });

  it("passes auth headers from broker to fetch", async () => {
    const broker = makeMockBroker();
    await callModel(broker, TEST_MODEL, TEST_QUERY);

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const headers = fetchCall[1]!.headers as Record<string, string>;
    expect(headers["X-ZG-Auth"]).toBe("mock-auth-token");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("extracts chat ID from ZG-Res-Key header", async () => {
    const broker = makeMockBroker({ chatID: "header-chat-id" });
    const result = await callModel(broker, TEST_MODEL, TEST_QUERY);
    expect(result.chatID).toBe("header-chat-id");
  });

  it("passes usage data to processResponse for fee tracking", async () => {
    const broker = makeMockBroker();
    await callModel(broker, TEST_MODEL, TEST_QUERY);

    expect(broker.inference.processResponse).toHaveBeenCalledWith(
      TEST_MODEL.providerAddress,
      "test-chat-id-123",
      JSON.stringify({
        prompt_tokens: 20,
        completion_tokens: 50,
        total_tokens: 70,
      })
    );
  });

  it("handles TEE verification failure gracefully", async () => {
    const broker = makeMockBroker();
    broker.inference.processResponse.mockRejectedValue(
      new Error("TEE signature mismatch")
    );

    const result = await callModel(broker, TEST_MODEL, TEST_QUERY);
    expect(result.teeVerified).toBeNull();
    expect(result.content).toContain("Smart contract");
  });

  it("throws on non-200 HTTP response", async () => {
    const broker = makeMockBroker({ httpStatus: 500 });
    await expect(callModel(broker, TEST_MODEL, TEST_QUERY)).rejects.toThrow(
      "Inference failed (HTTP 500)"
    );
  });

  it("records timings for each phase", async () => {
    const broker = makeMockBroker();
    const result = await callModel(broker, TEST_MODEL, TEST_QUERY);

    expect(result.timings.metadata).toBeGreaterThanOrEqual(0);
    expect(result.timings.headers).toBeGreaterThanOrEqual(0);
    expect(result.timings.inference).toBeGreaterThanOrEqual(0);
    expect(result.timings.verification).toBeGreaterThanOrEqual(0);
    expect(result.timings.total).toBeGreaterThanOrEqual(
      result.timings.metadata +
        result.timings.headers +
        result.timings.inference +
        result.timings.verification -
        1 // floating point tolerance
    );
  });
});

describe("callModelsParallel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls multiple models and returns results for each", async () => {
    const broker = makeMockBroker();
    const models: ModelConfig[] = [
      { name: "model-a", providerAddress: "0xAAA" },
      { name: "model-b", providerAddress: "0xBBB" },
    ];

    const results = await callModelsParallel(broker, models, TEST_QUERY);

    expect(results).toHaveLength(2);
    expect(results[0].model).toBe("model-a");
    expect(results[1].model).toBe("model-b");
    expect(broker.inference.getServiceMetadata).toHaveBeenCalledTimes(2);
  });

  it("executes calls concurrently", async () => {
    let concurrentCalls = 0;
    let maxConcurrent = 0;

    const broker = makeMockBroker();
    broker.inference.getServiceMetadata = vi.fn().mockImplementation(async () => {
      concurrentCalls++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
      await new Promise((r) => setTimeout(r, 10));
      concurrentCalls--;
      return {
        endpoint: "https://compute-test.example.com/v1/proxy",
        model: "test-model",
      };
    });

    const models: ModelConfig[] = [
      { name: "model-a", providerAddress: "0xAAA" },
      { name: "model-b", providerAddress: "0xBBB" },
      { name: "model-c", providerAddress: "0xCCC" },
    ];

    await callModelsParallel(broker, models, TEST_QUERY);
    expect(maxConcurrent).toBe(3);
  });
});
