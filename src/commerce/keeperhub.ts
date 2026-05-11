import { keccak256, stringToBytes } from "viem";

export interface KeeperHubPaymentJob {
  reportId: string;
  amount: string;
  network: string;
  payTo: string | null;
  paymentHeaderHash: string | null;
  paymentTxHash: string | null;
}

export interface KeeperHubRetryPolicy {
  maxRetries?: number;
  baseDelayMs?: number;
  gasMultiplier?: number;
  gasBumpPercent?: number;
  gasReserveEth?: string;
}

export interface KeeperHubExecutionAttempt {
  attempt: number;
  delayMs: number;
  gasMultiplier: number;
  paymentHeaderHash: string | null;
}

export interface KeeperHubExecutionPlan {
  enabled: boolean;
  walletLabel: string;
  auditFingerprint: string;
  retryHeaderVerification: "match-x-payment-header-hash";
  walletProvisioningCommands: string[];
  retryAttempts: KeeperHubExecutionAttempt[];
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 750;
const DEFAULT_GAS_MULTIPLIER = 1.3;
const DEFAULT_GAS_BUMP_PERCENT = 12;
const DEFAULT_GAS_RESERVE_ETH = "0.002";

export function buildKeeperHubExecutionPlan(
  job: KeeperHubPaymentJob,
  policy: KeeperHubRetryPolicy = {},
): KeeperHubExecutionPlan {
  const maxRetries = Math.max(
    0,
    Math.floor(policy.maxRetries ?? DEFAULT_MAX_RETRIES),
  );
  const baseDelayMs = Math.max(0, policy.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const gasMultiplier = Math.max(
    1,
    policy.gasMultiplier ?? DEFAULT_GAS_MULTIPLIER,
  );
  const gasBumpPercent = Math.max(
    0,
    policy.gasBumpPercent ?? DEFAULT_GAS_BUMP_PERCENT,
  );
  const gasReserveEth = policy.gasReserveEth ?? DEFAULT_GAS_RESERVE_ETH;
  const walletLabel = sanitizeWalletLabel(`pot-${job.reportId}`);

  return {
    enabled: Boolean(job.payTo),
    walletLabel,
    auditFingerprint: buildAuditFingerprint(job),
    retryHeaderVerification: "match-x-payment-header-hash",
    walletProvisioningCommands: [
      `kh wallet add --network ${job.network} --label ${walletLabel} --yes`,
      `kh wallet fund --network ${job.network} --asset ETH --min-balance ${gasReserveEth} --yes`,
    ],
    retryAttempts: Array.from({ length: maxRetries + 1 }, (_, index) => ({
      attempt: index + 1,
      delayMs: index === 0 ? 0 : baseDelayMs * 2 ** (index - 1),
      gasMultiplier: roundGasMultiplier(
        gasMultiplier * (1 + gasBumpPercent / 100) ** index,
      ),
      paymentHeaderHash: job.paymentHeaderHash,
    })),
  };
}

export function verifyRetryPaymentHeader(
  originalPaymentHeaderHash: string | null,
  retryPaymentHeader: string | undefined,
): boolean {
  if (!originalPaymentHeaderHash || !retryPaymentHeader) return false;
  return hashPaymentHeader(retryPaymentHeader) === originalPaymentHeaderHash;
}

export function hashPaymentHeader(paymentHeader: string): string {
  return keccak256(stringToBytes(paymentHeader));
}

function buildAuditFingerprint(job: KeeperHubPaymentJob): string {
  return keccak256(
    stringToBytes(
      JSON.stringify({
        reportId: job.reportId,
        amount: job.amount,
        network: job.network,
        payTo: job.payTo,
        paymentHeaderHash: job.paymentHeaderHash,
        paymentTxHash: job.paymentTxHash,
      }),
    ),
  );
}

function sanitizeWalletLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function roundGasMultiplier(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
