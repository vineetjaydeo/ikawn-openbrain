/**
 * Centralized similarity threshold constants.
 * Used across search, chat context injection, distillation, and cross-brain sync.
 */
module.exports = {
  /** Minimum similarity for including memories in chat context (liberal — prefer recall over silence) */
  CHAT_CONTEXT_THRESHOLD: 0.2,

  /** Minimum similarity for distilled memory supersession (strict — avoid false merges) */
  SUPERSESSION_THRESHOLD: 0.85,

  /** Minimum similarity for cross-brain sync deduplication */
  SYNC_DEDUP_THRESHOLD: 0.85,

  /** Threshold for "high similarity" in distillation quality checks */
  HIGH_SIMILARITY_THRESHOLD: 0.80,
};
