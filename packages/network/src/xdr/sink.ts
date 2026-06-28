/**
 * xdr/sink.ts — the access-log -> SECURITY EVENT -> DETECTION pipeline, sealed
 * into a tamper-evident audit chain.
 *
 * Flow:
 *   raw access-log buffer
 *     -> parseAccessLog (parser.ts)        : NetworkSecurityEvent[]
 *     -> detect (detections.ts)            : XdrDetection[]
 *     -> AuditSinkPort.record(...)         : seal each detection (SHA-256 chain)
 *     -> in-memory detection store         : queryable recent detections
 *
 * The audit sink is injected as an AuditSinkPort (see ports.ts). In production it
 * is the REAL @recoder/governance `InMemoryAuditStore` — every sealed detection
 * advances the Merkle tip, so the detection feed is tamper-evident. The package
 * never constructs the governance store itself: that concrete wiring (and the
 * process-wide singleton) lives in the adopting service.
 */
import type { AuditInput } from '@recoder/governance';
import type { NetworkSecurityEvent, XdrDetection } from '../types';
import type { AuditSinkPort, AuditChainIntegrity } from '../ports';
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
  private readonly audit: AuditSinkPort;
  private readonly detections: XdrDetection[] = [];
  private readonly maxRetained: number;
  private readonly config: DetectionConfig;

  /**
   * @param audit   The audit sink port. REQUIRED — the package does not
   *                construct a governance store; the adopting service injects the
   *                real `@recoder/governance` `InMemoryAuditStore` here.
   * @param options Retention + detection tuning.
   */
  constructor(
    audit: AuditSinkPort,
    options?: {
      maxRetained?: number;
      config?: DetectionConfig;
    },
  ) {
    this.audit = audit;
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
  verifyChain(): AuditChainIntegrity {
    return this.audit.verify();
  }

  /** Current Merkle tip hash. */
  auditTip(): string {
    return this.audit.tipHash();
  }
}
