import { createRequire } from "module";
import { config } from "dotenv";

config();

const require = createRequire(import.meta.url);
const { ethers } = require("ethers");

import { REGISTRY_ABI, REGISTRY_BYTECODE } from "./registry.js";

const RPC_URL = process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai";

async function main() {
  const privateKey = process.env.OG_PRIVATE_KEY;
  if (!privateKey) throw new Error("OG_PRIVATE_KEY not set");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const address = await wallet.getAddress();

  console.log(`Deploying PoTReportRegistry...`);
  console.log(`  Wallet:  ${address}`);
  console.log(`  RPC:     ${RPC_URL}`);

  const balance = await provider.getBalance(address);
  console.log(`  Balance: ${ethers.formatEther(balance)} 0G\n`);

  const factory = new ethers.ContractFactory(
    REGISTRY_ABI,
    REGISTRY_BYTECODE,
    wallet
  );

  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log(`Deployed at: ${contractAddress}`);
  console.log(`\nAdd to .env:`);
  console.log(`POT_REGISTRY_ADDRESS=${contractAddress}`);
}

main().catch((err) => {
  console.error(`Deploy failed: ${err.message}`);
  process.exit(1);
});
