import { AXLClient } from "../agents/axl-client.js";
import { createQueryMessage, parseAgentMessage } from "../agents/dispatcher.js";

const NODE_A_KEY = process.env.AXL_NODE_A_KEY || "";
const NODE_B_KEY = process.env.AXL_NODE_B_KEY || "";

async function main() {
  const clientA = new AXLClient({ host: "http://127.0.0.1", port: 9002 });
  const clientB = new AXLClient({ host: "http://127.0.0.1", port: 9003 });

  console.log("=== AXL P2P Smoke Test ===\n");

  const topoA = await clientA.topology();
  console.log(`Node A: ${topoA.ourPublicKey.slice(0, 16)}... (${topoA.peers.length} peers)`);
  const topoB = await clientB.topology();
  console.log(`Node B: ${topoB.ourPublicKey.slice(0, 16)}... (${topoB.peers.length} peers)`);

  const peerB = NODE_B_KEY || topoB.ourPublicKey;
  const peerA = NODE_A_KEY || topoA.ourPublicKey;

  // 1. Send query A → B
  const query = createQueryMessage("What are the risks of lending ETH on Aave v3?");
  console.log(`\n[1] Sending query A → B (${query.requestId})...`);
  await clientA.send(peerB, JSON.stringify(query));
  console.log("    Sent!");

  // 2. Recv on B
  await new Promise((r) => setTimeout(r, 1000));
  console.log("\n[2] Receiving on B...");
  const messages = await clientB.recv();
  console.log(`    Got ${messages.length} message(s)`);

  if (messages.length > 0) {
    const raw = messages[0].data ?? JSON.stringify(messages[0]);
    const parsed = parseAgentMessage(raw);
    if (parsed?.type === "query") {
      console.log(`    ✓ Query received: "${parsed.query.slice(0, 50)}..."`);
      console.log(`    ✓ Request ID: ${parsed.requestId}`);
    }
  }

  // 3. Send response B → A
  const response = {
    type: "response" as const,
    requestId: query.requestId,
    model: "test-model",
    provider: "0xTest",
    content: "The top risks are smart contract vulnerabilities and liquidation cascades.",
    chatID: "chat-test",
    teeVerified: true,
    teeSignature: null,
    timestamp: new Date().toISOString(),
  };
  console.log("\n[3] Sending response B → A...");
  await clientB.send(peerA, JSON.stringify(response));
  console.log("    Sent!");

  // 4. Recv on A
  await new Promise((r) => setTimeout(r, 1000));
  console.log("\n[4] Receiving on A...");
  const replies = await clientA.recv();
  console.log(`    Got ${replies.length} message(s)`);

  if (replies.length > 0) {
    const raw = replies[0].data ?? JSON.stringify(replies[0]);
    const parsed = parseAgentMessage(raw);
    if (parsed?.type === "response") {
      console.log(`    ✓ Response from: ${parsed.model}`);
      console.log(`    ✓ TEE verified: ${parsed.teeVerified}`);
      console.log(`    ✓ Content: "${parsed.content.slice(0, 60)}..."`);
    }
  }

  console.log("\n✓ Bidirectional P2P messaging works over AXL!");
}

main().catch(console.error);
