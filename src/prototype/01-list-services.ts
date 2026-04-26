import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { createZGComputeNetworkReadOnlyBroker } = require("@0glabs/0g-serving-broker");

const MAINNET_RPC = "https://evmrpc.0g.ai";
const TESTNET_RPC = "https://evmrpc-testnet.0g.ai";

async function listServices(name: string, rpcUrl: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${name}: ${rpcUrl}`);
  console.log("=".repeat(60));

  const broker = await createZGComputeNetworkReadOnlyBroker(rpcUrl);
  const services = await broker.inference.listService();

  console.log(`Found ${services.length} services:\n`);
  for (const svc of services) {
    console.log(`  Provider: ${svc.provider}`);
    console.log(`  Model:    ${svc.model}`);
    console.log(`  Type:     ${svc.serviceType}`);
    console.log(`  URL:      ${svc.url}`);
    console.log("");
  }
}

async function main() {
  await listServices("TESTNET", TESTNET_RPC);
}

main().catch(console.error);
