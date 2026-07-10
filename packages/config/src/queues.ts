/** BullMQ queue names, shared between web (enqueue-only) and worker (consume). */
export const QUEUES = {
  normalize: "normalize",
  extract: "extract",
  translateSummarize: "translate-summarize",
  publishGate: "publish-gate",
  indexSync: "index-sync",
  alertMatchInstant: "alert-match-instant",
  alertDaily: "alert-daily",
  alertWeekly: "alert-weekly",
  emailDispatch: "email-dispatch",
  statusRefresh: "status-refresh",
  ingestionMonitor: "ingestion-monitor",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface NormalizeJob {
  rawNoticeId: string;
}

export interface IndexSyncJob {
  /** Tender ids to upsert (or remove when unpublished). */
  tenderIds: string[];
  /** Full reindex ignores tenderIds. */
  fullReindex?: boolean;
}

export interface EmailDispatchJob {
  template:
    | "welcome"
    | "alert-instant"
    | "alert-digest"
    | "weekly-digest"
    | "quota-hit"
    | "trial-payment-issue";
  to: string;
  locale: "en" | "tr";
  props: Record<string, unknown>;
  /** For alert emails: record an alert_deliveries row against this saved search. */
  savedSearchId?: string;
  userId?: string;
  tenderIds?: string[];
}

export interface AlertBatchJob {
  frequency: "instant" | "daily" | "weekly";
}
