/**
 * Alert-matching configuration.
 *
 * SEMANTIC_ALERT_THRESHOLD — minimum cosine similarity between a saved
 * search's embedding and a tender's embedding for a SEMANTIC alert match.
 * Deliberately looser than dedup's 0.85: dedup asks "is this the SAME
 * tender?", alerts ask "is this RELEVANT to the query?".
 *
 * The value is calibrated against real data with
 * apps/worker/src/scripts/calibrate-semantic-threshold.ts — change it here
 * (never hardcode it at call sites).
 *
 * 0.57 (founder decision, 2026-07-19): kills decoration/AC-repair noise while
 * keeping the computer-hardware and consultancy clusters; Turkish↔English
 * cross-lingual scoring runs ~0.05-0.10 low, so 0.60 proved too strict.
 */
export const SEMANTIC_ALERT_THRESHOLD = 0.57;
