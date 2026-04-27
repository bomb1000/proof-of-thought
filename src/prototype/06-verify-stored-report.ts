import { retrieveReportByHash } from "../storage/store.js";

const ROOT_HASH = process.argv[2] || "0xbfef84d570741a68fd1fab8ed75df82036708a57cc6d762313b9da6e26d491ec";

async function main() {
  console.log(`Retrieving PoT Report from 0G Storage...`);
  console.log(`Root hash: ${ROOT_HASH}\n`);

  const t0 = performance.now();
  const report = await retrieveReportByHash(ROOT_HASH);
  const elapsed = performance.now() - t0;

  console.log(`Retrieved in ${elapsed.toFixed(0)}ms\n`);
  console.log(`Report ID:     ${report.id}`);
  console.log(`Query:         ${report.query}`);
  console.log(`PoT Hash:      ${report.potHash}`);
  console.log(`TEE Verified:  ${report.responses[0]?.teeVerified}`);
  console.log(`Signer:        ${report.responses[0]?.teeSignature?.signing_address}`);
  console.log(`Agreement:     ${(report.consensus.agreementScore * 100).toFixed(1)}%`);
  console.log(`Claims:        ${report.consensus.convergedClaims.length}`);
}

main().catch(console.error);
