import { AXLClient } from "./axl-client.js";

export interface QueryMessage {
  type: "query";
  requestId: string;
  query: string;
  timestamp: string;
}

export interface ResponseMessage {
  type: "response";
  requestId: string;
  model: string;
  provider: string;
  content: string;
  chatID: string;
  teeVerified: boolean | null;
  teeSignature: any;
  timestamp: string;
}

export type AgentMessage = QueryMessage | ResponseMessage;

export function createQueryMessage(query: string): QueryMessage {
  return {
    type: "query",
    requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query,
    timestamp: new Date().toISOString(),
  };
}

export function parseAgentMessage(raw: string): AgentMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.type === "query" || parsed.type === "response") return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function dispatchQuery(
  client: AXLClient,
  peerIds: string[],
  query: string
): Promise<QueryMessage> {
  const message = createQueryMessage(query);
  const payload = JSON.stringify(message);

  await Promise.all(
    peerIds.map((peerId) => client.send(peerId, payload))
  );

  return message;
}

export async function collectResponses(
  client: AXLClient,
  requestId: string,
  expectedCount: number,
  timeoutMs: number = 30000,
  pollIntervalMs: number = 500
): Promise<ResponseMessage[]> {
  const responses: ResponseMessage[] = [];
  const deadline = Date.now() + timeoutMs;

  while (responses.length < expectedCount && Date.now() < deadline) {
    try {
      const messages = await client.recv();
      for (const msg of messages) {
        const parsed = parseAgentMessage(msg.data ?? JSON.stringify(msg));
        if (
          parsed?.type === "response" &&
          parsed.requestId === requestId
        ) {
          responses.push(parsed);
        }
      }
    } catch {
      // recv can fail transiently
    }

    if (responses.length < expectedCount) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  }

  return responses;
}
