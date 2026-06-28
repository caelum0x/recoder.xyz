/**
 * xdr/sink.ts — the access-log -> SECURITY EVENT -> DETECTION pipeline, sealed
 * into the governance Merkle audit chain.
 *
 * Flow:
 *   raw access-log buffer
 *     -> parseAccessLog (parser.ts)        : NetworkSecurityEvent[]
 *     -> detect (detections.ts)            : XdrDetection[]
 *     -> InMemoryAuditStore.record(...)    : seal each detection (SHA-256 chain)
 *     -> in-memory detection store         : queryable recent detections
 *
 * The audit store is the REAL @recoder/governance InMemoryAuditStore — every
 * sealed detection advances the Merkle tip, so the detection feed is
 * tamper-evident. The sink is the single owner of network XDR state.
 */
import { InMemoryAuditStore, type AuditInput } from '@recoder/governance';
import type { NetworkSecurityEvent, XdrDetection } from '../types';
import { parseAccessLog } from './parser';
import { detect, DEFAULT_DETECTION_CONFIG, type DetectionConfig } from './detections';

export interface IngestResult {
  readonly eventsParsed: number;
  readonly parseErrors: number;
  readonly detections: readonly XdrDetection[];
  /** Merkle tip after sealing this batch. */
  readonly auditTip: string;
}

/** Map an XDR severity to an audit outcome. Detections are always deny-flavored. */
function auditOutcomeFor(detection: XdrDetection): AuditInput['outcome'] {
  switch (detection.severity) {
    case 'critical':
    case 'high':
      return 'deny';
    default:
      return 'info';
  }
}

export class XdrSink {
  private readonly audit: InMemoryAuditStore;
  private readonly detections: XdrDetection[] = [];
  private readonly maxRetained: number;
  private readonly config: DetectionConfig;

  constructor(options?: {
    auditStore?: InMemoryAuditStore;
    maxRetained?: number;
    config?: DetectionConfig;
  }) {
    this.audit = options?.auditStore ?? new InMemoryAuditStore();
    this.maxRetained = options?.maxRetained ?? 1000;
    this.config = options?.config ?? DEFAULT_DETECTION_CONFIG;
  }

  /**
   * Ingest a raw Envoy access-log buffer: parse, detect, seal detections into
   * the Merkle chain, and retain them for query. Returns a summary.
   */
  ingest(rawAccessLog: string): IngestResult {
    const { events, errors } = parseAccessLog(rawAccessLog);
    const found = detect(events, this.config);

    const sealed = found.map((detection) => this.seal(detection));

    return {
      eventsParsed: events.length,
      parseErrors: errors.length,
      detections: sealed,
      auditTip: this.audit.tipHash(),
    };
  }

  /**
   * Ingest already-parsed events (e.g. from a live ALS gRPC stream adapter).
   * Same detection + sealing path as ingest().
   */
  ingestEvents(events: readonly NetworkSecurityEvent[]): IngestResult {
    const found = detect(events, this.config);
    const sealed = found.map((detection) => this.seal(detection));
    return {
      eventsParsed: events.length,
      parseErrors: 0,
      detections: sealed,
      auditTip: this.audit.tipHash(),
    };
  }

  private seal(detection: XdrDetection): XdrDetection {
    const entry = this.audit.record({
      timestamp: detection.detectedAt,
      actor: `xdr:${detection.subject}`,
      action: 'enforcement.checked',
      detail: `[${detection.ruleId}] ${detection.summary}`,
      outcome: auditOutcomeFor(detection),
      metadata: {
        detectionId: detection.detectionId,
        ruleId: detection.ruleId,
        severity: detection.severity,
        eventCount: detection.eventCount,
      },
    });

    const sealed: XdrDetection = { ...detection, auditHash: entry.hash };
    this.detections.push(sealed);
    if (this.detections.length > this.maxRetained) {
      this.detections.splice(0, this.detections.length - this.maxRetained);
    }
    return sealed;
  }

  /** Most recent detections, newest last, bounded by `limit`. */
  recent(limit = 100): readonly XdrDetection[] {
    const start = Math.max(0, this.detections.length - limit);
    return this.detections.slice(start);
  }

  /** All retained detections (defensive copy). */
  all(): readonly XdrDetection[] {
    return this.detections.map((d) => ({ ...d }));
  }

  /** Verify the audit chain backing the detection feed is intact. */
  verifyChain(): ReturnType<InMemoryAuditStore['verify']> {
    return this.audit.verify();
  }

  /** Current Merkle tip hash. */
  auditTip(): string {
    return this.audit.tipHash();
  }
}

/** Process-wide singleton sink for the network XDR feed. */
let sharedSink: XdrSink | null = null;

export function getXdrSink(): XdrSink {
  if (sharedSink === null) {
    sharedSink = new XdrSink();
  }
  return sharedSink;
}

/** Reset the shared sink (tests only). */
export function __resetXdrSinkForTests(): void {
  sharedSink = null;
}
