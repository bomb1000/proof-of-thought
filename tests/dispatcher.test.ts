import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createQueryMessage,
  parseAgentMessage,
  dispatchQuery,
  collectResponses,
  type ResponseMessage,
} from "../src/agents/dispatcher.js";
import { AXLClient } from "../src/agents/axl-client.js";

describe("createQueryMessage", () => {
  it("creates a query with unique request ID", () => {
    const msg = createQueryMessage("What are the risks?");
    expect(msg.type).toBe("query");
    expect(msg.query).toBe("What are the risks?");
    expect(msg.requestId).toMatch(/^req-\d+-\w+$/);
    expect(msg.timestamp).toBeTruthy();
  });

  it("generates different IDs each time", () => {
    const msg1 = createQueryMessage("a");
    const msg2 = createQueryMessage("b");
    expect(msg1.requestId).not.toBe(msg2.requestId);
  });
});

describe("parseAgentMessage", () => {
  it("parses a valid query message", () => {
    const msg = parseAgentMessage(JSON.stringify({
      type: "query",
      requestId: "req-1",
      query: "test",
      timestamp: "2026-01-01",
    }));
    expect(msg?.type).toBe("query");
  });

  it("parses a valid response message", () => {
    const msg = parseAgentMessage(JSON.stringify({
      type: "response",
      requestId: "req-1",
      model: "qwen",
      content: "answer",
    }));
    expect(msg?.type).toBe("response");
  });

  it("returns null for invalid JSON", () => {
    expect(parseAgentMessage("not json")).toBeNull();
  });

  it("returns null for unknown message types", () => {
    expect(parseAgentMessage('{"type":"unknown"}')).toBeNull();
  });
});

describe("dispatchQuery", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("sends query to all peers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const client = new AXLClient({ host: "http://127.0.0.1", port: 9002 });

    const msg = await dispatchQuery(client, ["peer-A", "peer-B"], "test query");

    expect(msg.type).toBe("query");
    expect(msg.query).toBe("test query");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);

    const call1 = vi.mocked(fetch).mock.calls[0];
    expect((call1[1]!.headers as Record<string, string>)["X-Destination-Peer-Id"]).toBe("peer-A");

    const call2 = vi.mocked(fetch).mock.calls[1];
    expect((call2[1]!.headers as Record<string, string>)["X-Destination-Peer-Id"]).toBe("peer-B");
  });
});

describe("collectResponses", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("collects matching responses", async () => {
    const response: ResponseMessage = {
      type: "response",
      requestId: "req-target",
      model: "qwen",
      provider: "0xA",
      content: "answer",
      chatID: "chat-1",
      teeVerified: true,
      teeSignature: null,
      timestamp: "2026-01-01",
    };

    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          text: async () => JSON.stringify([{ from: "peer-A", data: JSON.stringify(response) }]),
        };
      }
      return { ok: true, text: async () => "" };
    }));

    const client = new AXLClient({ host: "http://127.0.0.1", port: 9002 });
    const results = await collectResponses(client, "req-target", 1, 2000, 100);

    expect(results).toHaveLength(1);
    expect(results[0].model).toBe("qwen");
    expect(results[0].requestId).toBe("req-target");
  });

  it("ignores responses with wrong request ID", async () => {
    const wrongResponse: ResponseMessage = {
      type: "response",
      requestId: "req-OTHER",
      model: "qwen",
      provider: "0xA",
      content: "wrong",
      chatID: "chat-1",
      teeVerified: true,
      teeSignature: null,
      timestamp: "2026-01-01",
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify([{ from: "peer-A", data: JSON.stringify(wrongResponse) }]),
    }));

    const client = new AXLClient({ host: "http://127.0.0.1", port: 9002 });
    const results = await collectResponses(client, "req-target", 1, 1000, 100);

    expect(results).toHaveLength(0);
  });

  it("returns partial results on timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    }));

    const client = new AXLClient({ host: "http://127.0.0.1", port: 9002 });
    const results = await collectResponses(client, "req-target", 3, 500, 100);

    expect(results).toHaveLength(0);
  });
});
