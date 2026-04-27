import { describe, it, expect, vi, beforeEach } from "vitest";
import { AXLClient } from "../src/agents/axl-client.js";

const NODE = { host: "http://127.0.0.1", port: 9002 };

describe("AXLClient", () => {
  beforeEach(() => vi.restoreAllMocks());

  describe("send", () => {
    it("sends a message with correct headers", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
      const client = new AXLClient(NODE);

      await client.send("peer-123", '{"type":"query","query":"test"}');

      const call = vi.mocked(fetch).mock.calls[0];
      expect(call[0]).toBe("http://127.0.0.1:9002/send");
      expect(call[1]!.method).toBe("POST");
      expect((call[1]!.headers as Record<string, string>)["X-Destination-Peer-Id"]).toBe("peer-123");
      expect(call[1]!.body).toBe('{"type":"query","query":"test"}');
    });

    it("throws on HTTP error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
      const client = new AXLClient(NODE);

      await expect(client.send("peer-123", "data")).rejects.toThrow("AXL send failed (HTTP 503)");
    });
  });

  describe("recv", () => {
    it("returns parsed JSON array", async () => {
      const messages = [{ from: "peer-A", data: '{"type":"response"}' }];
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(messages),
      }));
      const client = new AXLClient(NODE);

      const result = await client.recv();
      expect(result).toEqual(messages);
    });

    it("returns empty array for empty body", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "",
      }));
      const client = new AXLClient(NODE);

      const result = await client.recv();
      expect(result).toEqual([]);
    });

    it("wraps plain text as a message", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "plain text message",
      }));
      const client = new AXLClient(NODE);

      const result = await client.recv();
      expect(result).toEqual([{ from: "unknown", data: "plain text message" }]);
    });

    it("throws on HTTP error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      const client = new AXLClient(NODE);

      await expect(client.recv()).rejects.toThrow("AXL recv failed (HTTP 500)");
    });
  });

  describe("topology", () => {
    it("returns normalized topology", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          our_public_key: "0xABC",
          peers: [{ public_key: "0xDEF", address: "tls://10.0.0.1:9001" }],
        }),
      }));
      const client = new AXLClient(NODE);

      const topo = await client.topology();
      expect(topo.ourPublicKey).toBe("0xABC");
      expect(topo.peers).toHaveLength(1);
      expect(topo.peers[0].publicKey).toBe("0xDEF");
    });

    it("handles empty peer list", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ our_public_key: "0xABC" }),
      }));
      const client = new AXLClient(NODE);

      const topo = await client.topology();
      expect(topo.peers).toEqual([]);
    });
  });

  describe("isHealthy", () => {
    it("returns true when topology succeeds", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ our_public_key: "0xABC", peers: [] }),
      }));
      const client = new AXLClient(NODE);

      expect(await client.isHealthy()).toBe(true);
    });

    it("returns false when topology fails", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));
      const client = new AXLClient(NODE);

      expect(await client.isHealthy()).toBe(false);
    });
  });
});
