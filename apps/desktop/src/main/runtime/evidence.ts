import { enforceRedaction, safeUrl, type SafeJson } from "./redaction";
import type { RunnerClient } from "./runner-client";

/**
 * Evidence the runtime is allowed to produce.
 *
 * CROSS-010 emits `receipt` and `log` only. Screenshots and DOM snapshots are
 * deliberately out of scope: the backend's DOM sanitizer catches password
 * inputs, card numbers, SSNs, and bearer tokens, but not a filled answer, and
 * a `redaction_applied` flag is a caller's claim rather than a proof. Adding
 * them needs pre-capture masking, guaranteed restoration, and absence tests,
 * which belong in their own order.
 */
export type AllowedEvidenceType = "receipt" | "log";

export const ALLOWED_EVIDENCE_TYPES: readonly AllowedEvidenceType[] = [
  "receipt",
  "log",
];

export class EvidenceRecorder {
  private readonly entries: SafeJson[] = [];

  constructor(
    private readonly client: RunnerClient,
    private readonly runId: string,
    private readonly attempt: number,
  ) {}

  /**
   * Append a structured step record.
   *
   * Entries are built from named fields by the caller and passed through the
   * redaction guard, so nothing page-derived reaches the log unfiltered.
   */
  record(event: string, detail: Record<string, SafeJson>): void {
    this.entries.push(
      enforceRedaction({
        event,
        at: new Date().toISOString(),
        ...detail,
      }),
    );
  }

  get log(): readonly SafeJson[] {
    return this.entries;
  }

  /** Upload the accumulated step log. */
  async flushLog(leaseToken: string): Promise<void> {
    if (this.entries.length === 0) {
      return;
    }
    await this.client.uploadEvidence(this.runId, leaseToken, {
      attempt: this.attempt,
      evidenceType: "log",
      filename: `run-${this.attempt}.log.json`,
      contents: JSON.stringify({ entries: this.entries }, null, 2),
      metadata: { entry_count: this.entries.length },
    });
  }

  /** Upload the receipt record captured after a released submit. */
  async recordReceipt(
    leaseToken: string,
    receipt: {
      finalUrl: string;
      confirmationSignal: string;
      platformReceiptId: string | null;
    },
  ): Promise<{ sha256: string }> {
    const payload = enforceRedaction({
      final_url: safeUrl(receipt.finalUrl),
      confirmation_signal: receipt.confirmationSignal,
      platform_receipt_id: receipt.platformReceiptId,
      captured_at: new Date().toISOString(),
    });
    const result = await this.client.uploadEvidence(this.runId, leaseToken, {
      attempt: this.attempt,
      evidenceType: "receipt",
      filename: `receipt-${this.attempt}.json`,
      contents: JSON.stringify(payload, null, 2),
      metadata: { confirmation_signal: receipt.confirmationSignal },
    });
    return { sha256: result.sha256 };
  }
}
