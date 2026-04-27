import { createRequire } from "module";
import { config } from "dotenv";

config();

const require = createRequire(import.meta.url);
const { Indexer } = require("@0gfoundation/0g-ts-sdk");

const INDEXER_RPC = "https://indexer-storage-testnet-turbo.0g.ai";
const ROOT_HASH = "0xec0a7b14037d75b49febf19c645c8a3c36fb67a93d98dbc5594b6cfa213a65d8";

async function main() {
  const indexer = new Indexer(INDEXER_RPC);

  console.log(`Downloading blob for root hash: ${ROOT_HASH}\n`);
  const t0 = performance.now();

  const [blob, err] = await indexer.downloadToBlob(ROOT_HASH);
  const elapsed = performance.now() - t0;

  if (err) {
    console.error("Download failed:", err);
    process.exit(1);
  }

  const text = await blob.text();
  console.log(`Downloaded in ${elapsed.toFixed(0)}ms (${blob.size} bytes)\n`);

  try {
    const parsed = JSON.parse(text);
    console.log("Parsed PoT Report:");
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log("Raw content:", text.slice(0, 500));
  }
}

main().catch(console.error);
