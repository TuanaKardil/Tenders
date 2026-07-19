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
 */
export const SEMANTIC_ALERT_THRESHOLD = 0.55;
