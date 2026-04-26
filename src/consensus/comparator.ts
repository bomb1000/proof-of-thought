import type {
  ModelResponse,
  Claim,
  Divergence,
  ConsensusResult,
} from "../types/index.js";

interface ParsedClaim {
  text: string;
  model: string;
}

function extractClaims(response: ModelResponse): ParsedClaim[] {
  const lines = response.content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const claims: ParsedClaim[] = [];
  for (const line of lines) {
    // Match numbered claims: "1. ...", "1) ...", "- ..."
    const match = line.match(/^(?:\d+[\.\)]\s*|-\s*|\*\s*)(.+)/);
    if (match) {
      claims.push({ text: match[1].trim(), model: response.model });
    }
  }

  // If no structured claims found, treat each sentence as a claim
  if (claims.length === 0) {
    const sentences = response.content
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20);
    for (const s of sentences) {
      claims.push({ text: s, model: response.model });
    }
  }

  return claims;
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function simpleStem(word: string): string {
  return word
    .replace(/ies$/, "y")
    .replace(/ves$/, "f")
    .replace(/(s|ed|ing|tion|ment|ness|ity|able|ible|ous|ive|al|ful|less)$/, "")
    .replace(/(.)\1$/, "$1");
}

function extractKeywords(text: string): Set<string> {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "above", "below", "between", "and", "but", "or",
    "nor", "not", "so", "yet", "both", "either", "neither", "each",
    "every", "all", "any", "few", "more", "most", "other", "some", "such",
    "no", "only", "own", "same", "than", "too", "very", "that", "this",
    "these", "those", "it", "its", "also", "remain", "pose", "biggest",
    "primary", "main", "major", "key", "top", "high", "concern",
  ]);

  const normalized = normalizeForComparison(text);
  return new Set(
    normalized
      .split(" ")
      .filter((w) => w.length > 2 && !stopWords.has(w))
      .map(simpleStem)
      .filter((w) => w.length > 2)
  );
}

function claimSimilarity(a: string, b: string): number {
  const kwA = extractKeywords(a);
  const kwB = extractKeywords(b);

  if (kwA.size === 0 || kwB.size === 0) return 0;

  let intersection = 0;
  for (const w of kwA) {
    if (kwB.has(w)) intersection++;
  }

  // Jaccard similarity
  const union = new Set([...kwA, ...kwB]).size;
  return union > 0 ? intersection / union : 0;
}

const SIMILARITY_THRESHOLD = 0.35;

export function buildConsensus(responses: ModelResponse[]): ConsensusResult {
  if (responses.length === 0) {
    return { agreementScore: 0, convergedClaims: [], divergences: [] };
  }

  if (responses.length === 1) {
    const claims = extractClaims(responses[0]);
    return {
      agreementScore: 1,
      convergedClaims: claims.map((c) => ({
        text: c.text,
        modelsAgreeing: [c.model],
        confidence: 0.5,
      })),
      divergences: [],
    };
  }

  // Extract claims from all models
  const allClaims: ParsedClaim[][] = responses.map(extractClaims);

  // Build claim clusters by finding similar claims across models
  const converged: Claim[] = [];
  const matched = new Set<string>(); // "modelIdx:claimIdx"

  for (let i = 0; i < allClaims.length; i++) {
    for (let ci = 0; ci < allClaims[i].length; ci++) {
      const key = `${i}:${ci}`;
      if (matched.has(key)) continue;

      const cluster: { text: string; model: string }[] = [allClaims[i][ci]];
      matched.add(key);

      for (let j = i + 1; j < allClaims.length; j++) {
        let bestScore = 0;
        let bestIdx = -1;
        for (let cj = 0; cj < allClaims[j].length; cj++) {
          const jKey = `${j}:${cj}`;
          if (matched.has(jKey)) continue;
          const score = claimSimilarity(
            allClaims[i][ci].text,
            allClaims[j][cj].text
          );
          if (score > bestScore) {
            bestScore = score;
            bestIdx = cj;
          }
        }
        if (bestScore >= SIMILARITY_THRESHOLD && bestIdx >= 0) {
          cluster.push(allClaims[j][bestIdx]);
          matched.add(`${j}:${bestIdx}`);
        }
      }

      if (cluster.length > 1) {
        converged.push({
          text: cluster[0].text,
          modelsAgreeing: cluster.map((c) => c.model),
          confidence: cluster.length / responses.length,
        });
      }
    }
  }

  // Find divergences — unmatched claims that cover similar topics
  const unmatched: ParsedClaim[] = [];
  for (let i = 0; i < allClaims.length; i++) {
    for (let ci = 0; ci < allClaims[i].length; ci++) {
      if (!matched.has(`${i}:${ci}`)) {
        unmatched.push(allClaims[i][ci]);
      }
    }
  }

  const divergences: Divergence[] = [];
  const divergenceMatched = new Set<number>();
  for (let i = 0; i < unmatched.length; i++) {
    if (divergenceMatched.has(i)) continue;
    for (let j = i + 1; j < unmatched.length; j++) {
      if (divergenceMatched.has(j)) continue;
      if (unmatched[i].model === unmatched[j].model) continue;

      const sim = claimSimilarity(unmatched[i].text, unmatched[j].text);
      if (sim > 0.15 && sim < SIMILARITY_THRESHOLD) {
        divergences.push({
          topic: extractKeywords(unmatched[i].text)
            .values()
            .next().value || "unknown",
          positions: [
            { model: unmatched[i].model, stance: unmatched[i].text },
            { model: unmatched[j].model, stance: unmatched[j].text },
          ],
        });
        divergenceMatched.add(i);
        divergenceMatched.add(j);
      }
    }
  }

  // Agreement score: proportion of total claims that converged
  const totalClaims = allClaims.reduce((sum, c) => sum + c.length, 0);
  const matchedCount = matched.size;
  const agreementScore =
    totalClaims > 0 ? Math.min(matchedCount / totalClaims, 1) : 0;

  // Sort by confidence
  converged.sort((a, b) => b.confidence - a.confidence);

  return { agreementScore, convergedClaims: converged, divergences };
}
