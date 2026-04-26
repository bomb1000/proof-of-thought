export interface TEESignature {
  text: string;
  signature: string;
  signing_address: string;
  signing_algo: string;
  provider_type: string;
  provider_identity: string;
  tls_cert_fingerprint: string;
}

export interface ModelResponse {
  model: string;
  provider: string;
  content: string;
  chatID: string;
  teeSignature: TEESignature | null;
  teeVerified: boolean | null;
  attestationUrl: string;
  timestamp: string;
  timings: {
    inference: number;
    verification: number;
    signatureFetch: number;
    total: number;
  };
}

export interface Claim {
  text: string;
  modelsAgreeing: string[];
  confidence: number;
}

export interface Divergence {
  topic: string;
  positions: { model: string; stance: string }[];
}

export interface ConsensusResult {
  agreementScore: number;
  convergedClaims: Claim[];
  divergences: Divergence[];
}

export interface PoTReport {
  id: string;
  query: string;
  timestamp: string;
  responses: ModelResponse[];
  consensus: ConsensusResult;
  proofChain: {
    model: string;
    provider: string;
    chatID: string;
    teeVerified: boolean | null;
    teeSignature: string | null;
  }[];
  potHash: string;
  storedOn?: string;
}

export interface ModelConfig {
  name: string;
  provider: string;
  endpoint?: string;
}
