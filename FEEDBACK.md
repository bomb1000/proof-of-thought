# KeeperHub Feedback

## What this PR covers

- Keeps PoT report delivery behind the existing `x402-express` payment middleware.
- Adds configurable report payment metadata through `X402_REPORT_PRICE` and `X402_NETWORK`.
- Records an audit trail for paid report reads with the report hash, proof-chain hash, per-response TEE proof hashes, the hashed `X-PAYMENT` header, decoded payment payload, and transaction hash when present.
- Adds a KeeperHub execution plan to the paid report receipt so an agent can carry the payment evidence into retries, gas bumping, and wallet preparation.
- Includes deterministic `kh wallet add` and `kh wallet fund` commands for report-specific wallet provisioning.

## Retry and gas behavior

KeeperHub is the right place to own reliable onchain execution, so this PR keeps settlement verification in `x402-express` and produces the KeeperHub handoff payload next to the receipt. The execution plan uses:

- Original `X-PAYMENT` header hash matching on every retry.
- Exponential backoff for retry timing.
- Configurable gas multiplier and deterministic gas bumps.
- A stable audit fingerprint over report ID, price, network, pay-to address, payment header hash, and payment transaction hash.

## Local validation

- `bunx tsc --noEmit`
- `bun test tests/audit.test.ts`
- `bunx prettier --check src/commerce/audit.ts src/commerce/keeperhub.ts src/server/api.ts tests/audit.test.ts README.md FEEDBACK.md`
- `bunx eslint src/commerce/audit.ts src/commerce/keeperhub.ts tests/audit.test.ts`
- `bunx eslint src/server/api.ts` returns zero errors; the remaining output is the pre-existing `any` warning pattern already present in the Express server file.

## Notes

I did not run a live KeeperHub-funded execution from this environment because no `KEEPERHUB_API_KEY`, authenticated `kh` session, or funded KeeperHub wallet was available locally. The PR keeps the live boundary explicit while making the payment evidence and retry plan deterministic for KeeperHub MCP, REST, or CLI execution.
