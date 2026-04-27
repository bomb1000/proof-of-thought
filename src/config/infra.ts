import { createRequire } from "module";
import { config } from "dotenv";

config();

const require = createRequire(import.meta.url);
const { createZGComputeNetworkBroker } = require("@0glabs/0g-serving-broker");
const { ethers } = require("ethers");

export function getRpcUrl(network: "testnet" | "mainnet"): string {
  return network === "mainnet"
    ? "https://evmrpc.0g.ai"
    : "https://evmrpc-testnet.0g.ai";
}

export async function getInfra(network: "testnet" | "mainnet"): Promise<{
  wallet: any;
  broker: any;
  provider: any;
  rpcUrl: string;
  address: string;
  balance: string;
}> {
  const privateKey = process.env.OG_PRIVATE_KEY;
  if (!privateKey) throw new Error("OG_PRIVATE_KEY not set");

  const rpcUrl = getRpcUrl(network);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const address = await wallet.getAddress();
  const balance = ethers.formatEther(await provider.getBalance(address));
  const broker = await createZGComputeNetworkBroker(wallet);

  return { wallet, broker, provider, rpcUrl, address, balance };
}
