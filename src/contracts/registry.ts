import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { ethers } = require("ethers");

export const REGISTRY_ABI = [
  "event ReportRegistered(bytes32 indexed potHash, bytes32 storageRootHash, address indexed reporter, uint256 timestamp)",
  "function registerReport(bytes32 potHash, bytes32 storageRootHash) external",
  "function getReport(bytes32 potHash) external view returns (bytes32 storageRootHash, uint256 timestamp, address reporter)",
];

export const REGISTRY_BYTECODE =
  "0x6080604052348015600e575f80fd5b506103e18061001c5f395ff3fe608060405234801561000f575f80fd5b506004361061003f575f3560e01c8063171c4f1114610043578063b39c489714610075578063b944c073146100a7575b5f80fd5b61005d60048036038101906100589190610280565b6100c3565b60405161006c93929190610311565b60405180910390f35b61008f600480360381019061008a9190610280565b610114565b60405161009e93929190610311565b60405180910390f35b6100c160048036038101906100bc9190610346565b610158565b005b5f805f805f808681526020019081526020015f209050805f01548160010154826002015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff16935093509350509193909250565b5f602052805f5260405f205f91509050805f015490806001015490806002015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905083565b60405180606001604052808281526020014281526020013373ffffffffffffffffffffffffffffffffffffffff168152505f808481526020019081526020015f205f820151815f0155602082015181600101556040820151816002015f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055509050503373ffffffffffffffffffffffffffffffffffffffff16827f643c20d4039f93d4ec5f3ca192967a635e9c4381aa3e22ddf74f99738d45abd4834260405161023d929190610384565b60405180910390a35050565b5f80fd5b5f819050919050565b61025f8161024d565b8114610269575f80fd5b50565b5f8135905061027a81610256565b92915050565b5f6020828403121561029557610294610249565b5b5f6102a28482850161026c565b91505092915050565b6102b48161024d565b82525050565b5f819050919050565b6102cc816102ba565b82525050565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f6102fb826102d2565b9050919050565b61030b816102f1565b82525050565b5f6060820190506103245f8301866102ab565b61033160208301856102c3565b61033e6040830184610302565b949350505050565b5f806040838503121561035c5761035b610249565b5b5f6103698582860161026c565b925050602061037a8582860161026c565b9150509250929050565b5f6040820190506103975f8301856102ab565b6103a460208301846102c3565b939250505056fea26469706673582212209c3f929709e3cab0040b8851d8212f5814e64c46590db8bd5838879e40545fac64736f6c634300081a0033";

let _contractAddress: string | null = null;

export function setRegistryAddress(address: string): void {
  _contractAddress = address;
}

export function getRegistryAddress(): string | null {
  return _contractAddress || process.env.POT_REGISTRY_ADDRESS || null;
}

export async function registerReportOnChain(
  potHash: string,
  storageRootHash: string,
  signer: any
): Promise<{ txHash: string; blockNumber: number }> {
  const address = getRegistryAddress();
  if (!address) throw new Error("Registry contract address not configured");

  const contract = new ethers.Contract(address, REGISTRY_ABI, signer);
  const tx = await contract.registerReport(potHash, storageRootHash);
  const receipt = await tx.wait();

  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function getReportFromChain(
  potHash: string,
  provider: any
): Promise<{ storageRootHash: string; timestamp: number; reporter: string }> {
  const address = getRegistryAddress();
  if (!address) throw new Error("Registry contract address not configured");

  const contract = new ethers.Contract(address, REGISTRY_ABI, provider);
  const [storageRootHash, timestamp, reporter] =
    await contract.getReport(potHash);

  return {
    storageRootHash,
    timestamp: Number(timestamp),
    reporter,
  };
}
