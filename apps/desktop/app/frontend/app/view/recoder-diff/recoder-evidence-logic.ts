// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { base64ToArrayBuffer } from "@/util/util";
import { atom, type PrimitiveAtom } from "jotai";
import { agentLabel } from "../recoder/recoder-agent-labels";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorReason } from "../recoder/recoder-errors";

// The framework-mapped compliance status of one control. Kept to the backend's
// exact vocabulary; anything unrecognized degrades to "not-evidenced" so an
// unknown value can never read as a pass (never a fabricated green).
type EvidenceStatus = "met" | "partial" | "not-evidenced";

// One control row projected for the panel: the framework + id + truthful status,
// with the backend's verbatim reason (only when not fully met) and any refs.
type EvidenceControlView = {
    id: string;
    framework: string;
    title: string;
    status: EvidenceStatus;
    reason: string;
    evidenceRefs: string[];
};

type EvidenceCoverage = { met: number; partial: number; notEvidenced: number; total: number };

// The three external frameworks the starter catalog annotates. Kept to the
// backend's exact vocabulary so the panel groups the pack's `frameworks[]` verbatim.
type EvidenceFramework = "SOC2" | "EU-AI-Act" | "DORA";

// A named evidence SECTION of the sealed record a mapping may cite. Every ref an
// annotation carries is genuinely present in the record — a mapping never
// references absent evidence (that invariant is the backend mapper's; we mirror it).
type EvidenceSectionRef = "governance.verdict" | "approval" | "seal" | "verification" | "convergence.selections";

// One framework control annotation projected for the panel + summary: the control
// id, the record sections that back it (ALL present), and a one-line rationale.
// Mirrors the backend export pack's `frameworks[]` entries. The truthful framing is
// "controls this run's evidence supports" — never a certification / "COMPLIANT" claim.
type FrameworkAnnotationView = {
    framework: string;
    control: string;
    satisfiedBy: string[];
    rationale: string;
};

type FrameworkGroup = { framework: string; controls: FrameworkAnnotationView[] };

// The Ed25519 detached signature over the pack. `signature` (base64) signs the
// UTF-8 BYTES of `signedContentHash` (the hex string) — the backend signed
// `Buffer.from(contentHash)`, so any client verify must encode the string too.
type EvidenceSignatureView = {
    algorithm: string;
    publicKeyPem: string;
    signedContentHash: string;
    signature: string;
    signedAt: string;
};

// The truthful trust state of the pack's signature. `signed` = present + covers
// this pack's contentHash but NOT cryptographically checked; `verified` = a real
// WebCrypto Ed25519 verify passed; `invalid` = hash mismatch or a failed crypto
// verify (tampered); `unsigned` = no signature (no signing key configured).
type SignatureStatus = "unsigned" | "signed" | "verified" | "invalid";

type SignatureState = { status: SignatureStatus; reason: string };

// The exportable compliance pack, projected to what the panel renders. Every field
// is a truthful read of `data.export`; missing pieces degrade to neutral empties.
type EvidenceExportView = {
    schema: string;
    generatedAt: string;
    taskGroup: string;
    chosenWorkspaceId: string;
    mergedAt: string;
    integrityVerified: boolean;
    coverage: EvidenceCoverage;
    controls: EvidenceControlView[];
    // Truthfully-filtered framework annotations from the pack. Empty ([]) when the
    // pack carries none — the panel then renders no compliance subsection at all.
    frameworks: FrameworkAnnotationView[];
    contentHash: string;
    // Absent when the pack is unsigned (null/absent) — never a fabricated block.
    signature?: EvidenceSignatureView;
};

// Loose result shapes (repo convention: strictNullChecks off, so no discriminated
// narrowing). `noEvidence` is the truthful 404 signal — NOT an error.
type EvidenceExportResult = { ok: boolean; view?: EvidenceExportView; noEvidence?: boolean; error?: string };

type EvidenceMarkdownResult = { ok: boolean; markdown?: string; noEvidence?: boolean; error?: string };

function asObject(value: unknown): Record<string, unknown> | null {
    return value != null && typeof value == "object" ? (value as Record<string, unknown>) : null;
}

function numberOr(value: unknown, fallback: number): number {
    return typeof value == "number" && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
    return typeof value == "string" ? value : fallback;
}

function stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((x): x is string => typeof x == "string") : [];
}

// Never coerce an unknown status into a pass: only the three known values survive,
// everything else falls to the most conservative "not-evidenced".
function normalizeStatus(value: unknown): EvidenceStatus {
    if (value == "met") {
        return "met";
    }
    if (value == "partial") {
        return "partial";
    }
    return "not-evidenced";
}

function normalizeControls(value: unknown): EvidenceControlView[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: EvidenceControlView[] = [];
    for (const item of value) {
        const obj = asObject(item);
        if (obj == null) {
            continue;
        }
        const id = stringOr(obj.id, "");
        if (id == "") {
            continue;
        }
        out.push({
            id,
            framework: stringOr(obj.framework, ""),
            title: stringOr(obj.title, ""),
            status: normalizeStatus(obj.status),
            reason: stringOr(obj.reason, ""),
            evidenceRefs: stringArray(obj.evidenceRefs),
        });
    }
    return out;
}

// Project the pack's optional `frameworks[]` into views. Defensive like
// normalizeControls: an entry missing its framework, control, or backing sections
// is dropped — the pack's invariant is "never a mapping citing absent evidence", so
// a mapping with no `satisfiedBy` is not a truthful annotation and never renders.
function normalizeFrameworks(value: unknown): FrameworkAnnotationView[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: FrameworkAnnotationView[] = [];
    for (const item of value) {
        const obj = asObject(item);
        if (obj == null) {
            continue;
        }
        const framework = stringOr(obj.framework, "");
        const control = stringOr(obj.control, "");
        const satisfiedBy = stringArray(obj.satisfiedBy);
        if (framework == "" || control == "" || satisfiedBy.length == 0) {
            continue;
        }
        out.push({ framework, control, satisfiedBy, rationale: stringOr(obj.rationale, "") });
    }
    return out;
}

const FrameworkDisplayOrder: readonly string[] = ["SOC2", "EU-AI-Act", "DORA"];

// Group the flat annotation list by framework for display, in a stable
// enterprise-legible order (SOC2 → EU-AI-Act → DORA, then any others in first-seen
// order). PURE: builds new groups, never mutates the input; empty in → empty out.
function groupFrameworks(frameworks: FrameworkAnnotationView[]): FrameworkGroup[] {
    const groups: FrameworkGroup[] = [];
    const byName: Record<string, FrameworkGroup> = {};
    for (const ann of frameworks ?? []) {
        let group = byName[ann.framework];
        if (group == null) {
            group = { framework: ann.framework, controls: [] };
            byName[ann.framework] = group;
            groups.push(group);
        }
        group.controls.push(ann);
    }
    const rank = (name: string) => {
        const i = FrameworkDisplayOrder.indexOf(name);
        return i == -1 ? FrameworkDisplayOrder.length : i;
    };
    return groups.sort((a, b) => rank(a.framework) - rank(b.framework));
}

function normalizeCoverage(value: unknown): EvidenceCoverage {
    const obj = asObject(value);
    if (obj == null) {
        return { met: 0, partial: 0, notEvidenced: 0, total: 0 };
    }
    return {
        met: numberOr(obj.met, 0),
        partial: numberOr(obj.partial, 0),
        notEvidenced: numberOr(obj.notEvidenced, 0),
        total: numberOr(obj.total, 0),
    };
}

// A signature block is only meaningful with both a signature and the hash it
// covers; a partial/absent block degrades to undefined ("unsigned"), never to a
// fabricated invalid-tampered scream.
function normalizeSignature(value: unknown): EvidenceSignatureView {
    const obj = asObject(value);
    if (obj == null) {
        return undefined;
    }
    const signature = stringOr(obj.signature, "");
    const signedContentHash = stringOr(obj.signedContentHash, "");
    if (signature == "" || signedContentHash == "") {
        return undefined;
    }
    return {
        algorithm: stringOr(obj.algorithm, ""),
        publicKeyPem: stringOr(obj.publicKeyPem, ""),
        signedContentHash,
        signature,
        signedAt: stringOr(obj.signedAt, ""),
    };
}

// Project `data.export` into the panel view. `subject` carries the merge facts;
// `evidenceIntegrity.verified` is read strictly (only a real `true` is verified).
function parseEvidenceExport(data: Record<string, unknown>): EvidenceExportView {
    const subject = asObject(data.subject) ?? {};
    const integrity = asObject(data.evidenceIntegrity) ?? {};
    const view: EvidenceExportView = {
        schema: stringOr(data.schema, ""),
        generatedAt: stringOr(data.generatedAt, ""),
        taskGroup: stringOr(subject.taskGroup, ""),
        chosenWorkspaceId: stringOr(subject.chosenWorkspaceId, ""),
        mergedAt: stringOr(subject.mergedAt, ""),
        integrityVerified: integrity.verified === true,
        coverage: normalizeCoverage(data.coverage),
        controls: normalizeControls(data.controls),
        frameworks: normalizeFrameworks(data.frameworks),
        contentHash: stringOr(data.contentHash, ""),
    };
    const signature = normalizeSignature(data.signature);
    if (signature != null) {
        view.signature = signature;
    }
    return view;
}

// Pure, no-crypto trust derivation — ALWAYS run. A missing signature is unsigned;
// a signature that covers a different hash than the pack carries is invalid
// (tampered) with NO crypto needed; otherwise it is present-and-hash-matched
// ("signed"), which is NOT a claim that the crypto was checked.
function deriveSignatureStatus(view: EvidenceExportView): SignatureState {
    const sig = view.signature;
    if (sig == null) {
        return { status: "unsigned", reason: "" };
    }
    if (sig.signedContentHash != view.contentHash) {
        return { status: "invalid", reason: "signature covers a different contentHash than the pack — tampered" };
    }
    return { status: "signed", reason: "" };
}

// Returns a plain ArrayBuffer (not a Uint8Array<ArrayBufferLike>) so it satisfies
// WebCrypto's BufferSource without a cast. Null on non-PEM/decoding failure.
function pemToDer(pem: string): ArrayBuffer {
    try {
        const body = (pem ?? "").replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "");
        if (body.trim() == "") {
            return null;
        }
        return base64ToArrayBuffer(body);
    } catch {
        return null;
    }
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToHex(bytes: Uint8Array): string {
    let hex = "";
    for (const b of bytes) {
        hex += b.toString(16).padStart(2, "0");
    }
    return hex;
}

// Real WebCrypto Ed25519 verify. Returns true (cryptographically verified), false
// (verify failed → tampered), or null (this environment can't verify Ed25519 —
// NOT the same as invalid). The message is the UTF-8 bytes of signedContentHash,
// matching the backend's `Buffer.from(contentHash)`. Never throws.
async function cryptoVerifyEd25519(sig: EvidenceSignatureView): Promise<boolean> {
    const subtle = globalThis.crypto?.subtle;
    if (subtle == null || sig.algorithm != "ed25519") {
        return null;
    }
    try {
        const der = pemToDer(sig.publicKeyPem);
        if (der == null) {
            return null;
        }
        const signatureBytes = base64ToArrayBuffer(sig.signature);
        const message = bytesToArrayBuffer(new TextEncoder().encode(sig.signedContentHash));
        const key = await subtle.importKey("spki", der, { name: "Ed25519" }, false, ["verify"]);
        return await subtle.verify({ name: "Ed25519" }, key, signatureBytes, message);
    } catch {
        return null;
    }
}

// Combine the pure baseline with an (injectable) crypto verify. A `signed`
// baseline is upgraded to `verified` ONLY on a real true, downgraded to `invalid`
// ONLY on a real false; an unavailable verifier (null / throw) STAYS `signed` —
// an environment that can't verify is never conflated with a bad signature.
async function deriveVerifiedSignature(
    view: EvidenceExportView,
    verify: (sig: EvidenceSignatureView) => Promise<boolean>
): Promise<SignatureState> {
    const baseline = deriveSignatureStatus(view);
    if (baseline.status != "signed") {
        return baseline;
    }
    try {
        const result = await verify(view.signature);
        if (result === true) {
            return { status: "verified", reason: "" };
        }
        if (result === false) {
            return { status: "invalid", reason: "Ed25519 signature did not verify against the embedded public key" };
        }
        return baseline;
    } catch {
        return baseline;
    }
}

// SHA-256 fingerprint of the signer's SPKI public key, first 12 hex — an auditor
// matches it against the published org key. Degrade-safe: "" when crypto/key is
// unavailable (never a fabricated fingerprint).
async function signaturePublicKeyFingerprint(pem: string): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    const der = pemToDer(pem);
    if (subtle == null || der == null) {
        return "";
    }
    try {
        const digest = await subtle.digest("SHA-256", der);
        return bytesToHex(new Uint8Array(digest)).slice(0, 12);
    } catch {
        return "";
    }
}

// GET the JSON compliance export for a merged workspace. Degrade-safe: a 404 is the
// truthful "no evidence yet" signal (not an error); any other non-2xx surfaces the
// backend's verbatim reason; an unreachable backend surfaces a connectivity line.
async function fetchEvidenceExport(workspaceId: string): Promise<EvidenceExportResult> {
    const id = (workspaceId ?? "").trim();
    if (id == "") {
        return { ok: false, error: "No workspace selected." };
    }
    try {
        const res = await fetch(
            `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(id)}/evidence/export?format=json`
        );
        if (res.status == 404) {
            return { ok: false, noEvidence: true };
        }
        const body = await res.json().catch(() => null);
        if (!res.ok) {
            return { ok: false, error: readErrorReason(body) || `Evidence unavailable (HTTP ${res.status}).` };
        }
        // Backend envelope: `{ data: { export: EvidenceExport } }` — unwrap `.export`
        // (fall back to the envelope itself for tolerance).
        const envelope = asObject(asObject(body)?.data) ?? asObject(body) ?? {};
        const exportObj = asObject(envelope.export) ?? envelope;
        return { ok: true, view: parseEvidenceExport(exportObj) };
    } catch {
        return { ok: false, error: "Evidence unavailable — Recoder isn’t reachable." };
    }
}

// GET the Markdown compliance pack (text/markdown) for saving/opening as a file.
// Same 404 = no-evidence discipline; a non-2xx/unreachable surfaces truthfully.
async function fetchEvidenceMarkdown(workspaceId: string): Promise<EvidenceMarkdownResult> {
    const id = (workspaceId ?? "").trim();
    if (id == "") {
        return { ok: false, error: "No workspace selected." };
    }
    try {
        const res = await fetch(
            `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(id)}/evidence/export?format=md`
        );
        if (res.status == 404) {
            return { ok: false, noEvidence: true };
        }
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            return { ok: false, error: readErrorReason(body) || `Evidence pack unavailable (HTTP ${res.status}).` };
        }
        const markdown = await res.text();
        return { ok: true, markdown };
    } catch {
        return { ok: false, error: "Evidence pack unavailable — Recoder isn’t reachable." };
    }
}

// One check line from the persisted preview verification (open / assert /
// screenshot), projected for the panel. `name` carries the backend's `tool`.
type PreviewCheckRow = {
    name: string;
    status: string;
    detail?: string;
};

// The persisted preview-verification record projected for the panel. `status` is
// the backend's verbatim vocabulary (passed | failed | skipped) kept as a plain
// string so an unknown value can never be coerced into a pass. `screenshotNote`
// is ALWAYS "screenshot not retained": the backend seals only an opaque artifact
// id (screenshotRef is always null), so the panel says so — never a broken image.
type PreviewVerificationViewModel = {
    status: string;
    checkedAt: string;
    summary: string;
    degraded: boolean;
    reason?: string;
    checks: PreviewCheckRow[];
    screenshotNote: string;
};

// The truthful failure split of the read: `not-verified` and `workspace-missing`
// mirror the backend's two distinct 404 messages; `unreachable` covers transport
// faults and other non-2xx (the read proved nothing — never a fabricated pass).
type PreviewVerificationFailure = "not-verified" | "workspace-missing" | "unreachable";

type PreviewVerificationResult = {
    ok: boolean;
    view?: PreviewVerificationViewModel;
    reason?: PreviewVerificationFailure;
};

// The model-fetched preview verification, tagged with the workspace it describes.
// Module-scoped rather than on the diff model because the evidence panel mounts
// with only a workspaceId (no model reference), and importing the model from the
// panel would close an import cycle (model → view → panel). The tag keeps the
// read honest: a panel whose workspace doesn't match renders its not-loaded line,
// never another workspace's verdict.
type PreviewVerificationState = {
    workspaceId: string;
    loading: boolean;
    result?: PreviewVerificationResult;
};

const previewVerificationStateAtom = atom(null) as PrimitiveAtom<PreviewVerificationState>;

const ScreenshotNotRetainedNote = "screenshot not retained";

function normalizePreviewChecks(value: unknown): PreviewCheckRow[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: PreviewCheckRow[] = [];
    for (const item of value) {
        const obj = asObject(item);
        if (obj == null) {
            continue;
        }
        const name = stringOr(obj.tool, "");
        if (name == "") {
            continue;
        }
        const row: PreviewCheckRow = { name, status: stringOr(obj.status, "") };
        const detail = stringOr(obj.message, "");
        if (detail != "") {
            row.detail = detail;
        }
        out.push(row);
    }
    return out;
}

// Project the persisted verification into the panel view. Defensive like
// parseEvidenceExport: missing/garbage fields degrade to neutral empties, never a
// throw; `degraded` is only true on a real `true`, so garbage can't fake either
// a pass or a degrade.
function parsePreviewVerification(raw: unknown): PreviewVerificationViewModel {
    const obj = asObject(raw) ?? {};
    const view: PreviewVerificationViewModel = {
        status: stringOr(obj.status, ""),
        checkedAt: stringOr(obj.checkedAt, ""),
        summary: stringOr(obj.summary, ""),
        degraded: obj.degraded === true,
        checks: normalizePreviewChecks(obj.checks),
        screenshotNote: ScreenshotNotRetainedNote,
    };
    const reason = stringOr(obj.reason, "");
    if (reason != "") {
        view.reason = reason;
    }
    return view;
}

// GET the last preview verification for a workspace. Degrade-safe tri-state: the
// backend's two truthful 404s ("preview not verified" vs "workspace not found")
// each surface as their own reason so the panel can name the real gap; transport
// faults and other non-2xx land on `unreachable`. Never throws, never fabricates.
async function fetchPreviewVerification(workspaceId: string): Promise<PreviewVerificationResult> {
    const id = (workspaceId ?? "").trim();
    if (id == "") {
        return { ok: false, reason: "workspace-missing" };
    }
    try {
        const res = await fetch(
            `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(id)}/preview-verification`
        );
        const body = await res.json().catch(() => null);
        if (res.status == 404) {
            const reason = readErrorReason(body);
            return { ok: false, reason: reason.includes("workspace not found") ? "workspace-missing" : "not-verified" };
        }
        if (!res.ok) {
            return { ok: false, reason: "unreachable" };
        }
        // Backend envelope: `{ data: { verification } }` — unwrap `.verification`
        // (fall back to the envelope itself for tolerance).
        const envelope = asObject(asObject(body)?.data) ?? asObject(body) ?? {};
        return { ok: true, view: parsePreviewVerification(envelope.verification ?? envelope) };
    } catch {
        return { ok: false, reason: "unreachable" };
    }
}

function sanitizeForFilename(value: string): string {
    const clean = (value ?? "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return clean == "" ? "workspace" : clean;
}

function evidenceFilename(workspaceId: string): string {
    return `recoder-evidence-${sanitizeForFilename(workspaceId)}.md`;
}

// Trigger a browser download of one text file — the Wave fork's proven save path
// (same mechanism as saveConvergenceEvidence). Degrade-safe: a missing DOM
// (preview harness) is swallowed so a Download click never throws.
function triggerTextDownload(filename: string, content: string, mime: string): void {
    try {
        if (typeof document == "undefined" || document.body == null) {
            return;
        }
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    } catch {
        // degrade-safe: no browser download context — the caller's status copy stays truthful
    }
}

// The sealed record from GET …/evidence, kept as the backend's VERBATIM JSON
// ({ evidence, seal }) — its contentHash covers those exact bytes, so the export
// never re-projects it. Same 404 = truthful no-evidence discipline as the pack.
type EvidenceRecordResult = { ok: boolean; record?: Record<string, unknown>; noEvidence?: boolean; error?: string };

async function fetchEvidenceRecord(workspaceId: string): Promise<EvidenceRecordResult> {
    const id = (workspaceId ?? "").trim();
    if (id == "") {
        return { ok: false, error: "No workspace selected." };
    }
    try {
        const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(id)}/evidence`);
        if (res.status == 404) {
            return { ok: false, noEvidence: true };
        }
        const body = await res.json().catch(() => null);
        if (!res.ok) {
            return { ok: false, error: readErrorReason(body) || `Evidence unavailable (HTTP ${res.status}).` };
        }
        const envelope = asObject(asObject(body)?.data) ?? asObject(body) ?? {};
        const record = asObject(envelope.evidence);
        if (record == null) {
            return { ok: false, error: "Evidence response carried no record." };
        }
        return { ok: true, record };
    } catch {
        return { ok: false, error: "Evidence unavailable — Recoder isn’t reachable." };
    }
}

const EvidenceSummaryUnknown = "(unknown)";

function summarizeContested(evidence: Record<string, unknown>, candidates: Record<string, unknown>[]): string[] {
    const convergence = asObject(evidence.convergence);
    if (convergence == null) {
        return ["Contested files: none recorded — single-agent merge (no per-file convergence provenance)."];
    }
    const selections = Array.isArray(convergence.selections)
        ? convergence.selections.map(asObject).filter((s) => s != null)
        : [];
    const contested = selections.filter((s) => s.contested === true);
    if (contested.length == 0) {
        return ["Contested files: none — every converged path had a single author."];
    }
    const agentByWorkspace: Record<string, string> = {};
    for (const c of candidates) {
        const ws = stringOr(c.workspaceId, "");
        const agent = stringOr(c.agent, "");
        if (ws != "" && agent != "") {
            agentByWorkspace[ws] = agentLabel(agent);
        }
    }
    const nameOf = (ws: string) => agentByWorkspace[ws] ?? ws;
    const lines = [`Contested files (${contested.length}):`];
    for (const s of contested) {
        const path = stringOr(s.path, EvidenceSummaryUnknown);
        const mode = stringOr(s.mode, "");
        if (mode == "pick") {
            const source = stringOr(s.sourceWorkspaceId, "");
            lines.push(`  - ${path}: picked from ${source == "" ? "(source unrecorded)" : nameOf(source)}`);
            continue;
        }
        if (mode == "synthesize") {
            const contributors = stringArray(s.contributors).map(nameOf);
            const from = contributors.length == 0 ? "(contributors unrecorded)" : contributors.join(" + ");
            lines.push(`  - ${path}: assisted synthesize (3-way merge) of ${from}`);
            continue;
        }
        lines.push(`  - ${path}: resolution mode unrecorded`);
    }
    return lines;
}

function summarizeGovernance(governance: Record<string, unknown>): string[] {
    if (governance == null) {
        return ["Governance: verdict unrecorded."];
    }
    const effect = stringOr(governance.effect, EvidenceSummaryUnknown);
    const tier = stringOr(governance.riskTier, EvidenceSummaryUnknown);
    const degraded = governance.degraded === true ? " · degraded" : "";
    const approvalId = stringOr(governance.approvalId, "");
    const approval = approvalId == "" ? "no human approval recorded" : `human approval ${approvalId}`;
    return [`Governance: ${effect} · tier ${tier}${degraded} · ${approval}`];
}

function summarizeVerification(verification: Record<string, unknown>): string[] {
    if (verification == null) {
        return ["Verification: unrecorded."];
    }
    if (verification.available !== true) {
        return [`Verification: unavailable — ${stringOr(verification.reason, "no reason recorded")}`];
    }
    const verdict = stringOr(verification.verdict, "no verdict recorded");
    const blockers = stringArray(verification.blockers);
    return [`Verification: ${verdict}${blockers.length > 0 ? ` · blockers: ${blockers.join(", ")}` : ""}`];
}

// A catalog row: emit iff every `required` section is present; `corroborating`
// sections join `satisfiedBy` when present. A faithful port of the backend's
// framework-mapping catalog so the DOWNLOADED summary derives the same mappings
// the /evidence/export pack does — the sealed record carries no `frameworks`, so
// the summary must re-derive them from the record it bundles.
type FrameworkControlMapping = {
    framework: EvidenceFramework;
    control: string;
    required: EvidenceSectionRef[];
    corroborating?: EvidenceSectionRef[];
    rationale: string;
};

const FrameworkControlCatalog: readonly FrameworkControlMapping[] = [
    {
        framework: "SOC2",
        control: "CC8.1",
        required: ["governance.verdict", "approval", "seal"],
        rationale:
            "Change management: the governed merge verdict, the recorded human approval, and the tamper-evident audit seal together evidence an authorized, tracked change.",
    },
    {
        framework: "SOC2",
        control: "CC7.2",
        required: ["verification"],
        rationale:
            "System monitoring: the pre-merge readiness verification evidences the change was checked for anomalies before promotion.",
    },
    {
        framework: "SOC2",
        control: "CC4.1",
        required: ["seal"],
        rationale:
            "Monitoring of controls: the hash-chained Merkle audit seal supports independent after-the-fact evaluation of the change trail.",
    },
    {
        framework: "EU-AI-Act",
        control: "Art. 14",
        required: ["approval"],
        corroborating: ["convergence.selections"],
        rationale:
            "Human oversight: a recorded human approval (corroborated by contested per-file picks when present) evidences a human overseeing the AI-produced change.",
    },
    {
        framework: "EU-AI-Act",
        control: "Art. 12",
        required: ["seal"],
        rationale:
            "Record-keeping: the hash-chained audit seal evidences automatic, tamper-evident logging of the merge event.",
    },
    {
        framework: "EU-AI-Act",
        control: "Art. 9",
        required: ["governance.verdict", "verification"],
        rationale:
            "Risk management: the risk-tiered governance verdict plus pre-merge verification evidence a risk-managed release step.",
    },
    {
        framework: "DORA",
        control: "Art. 9(4)(e)",
        required: ["verification", "seal"],
        rationale:
            "ICT change management: pre-merge verification plus the sealed audit trail evidence a controlled, tested ICT change.",
    },
    {
        framework: "DORA",
        control: "Art. 24",
        required: ["verification"],
        rationale:
            "Operational resilience testing: the pre-merge verification run is the recorded test evidence for this change.",
    },
    {
        framework: "DORA",
        control: "Art. 6",
        required: ["governance.verdict", "verification"],
        rationale:
            "ICT risk management framework: the risk-tiered governance decision plus verification show the change passed the ICT risk framework.",
    },
];

// Which sections the sealed record ACTUALLY carries — proven from the runtime value,
// never assumed. Mirrors the backend mapper's presence rules exactly so the summary
// can't over-claim: no recorded approvalId → no human-oversight mapping; a null/blank
// auditEntryHash → no seal; verification only when it truly ran (`available:true`);
// a selection counts only when a HUMAN resolved a contested path (explicit pick).
function frameworkPresentSections(record: unknown): Set<EvidenceSectionRef> {
    const root = asObject(record) ?? {};
    const evidence = asObject(root.evidence) ?? {};
    const seal = asObject(root.seal) ?? {};
    const governance = asObject(evidence.governance) ?? {};
    const verification = asObject(evidence.verification) ?? {};
    const convergence = asObject(evidence.convergence) ?? {};
    const present = new Set<EvidenceSectionRef>();
    if (typeof governance.effect == "string") {
        present.add("governance.verdict");
    }
    if (stringOr(governance.approvalId, "") != "") {
        present.add("approval");
    }
    if (stringOr(seal.auditEntryHash, "") != "") {
        present.add("seal");
    }
    if (verification.available === true) {
        present.add("verification");
    }
    const selections = Array.isArray(convergence.selections)
        ? convergence.selections.map(asObject).filter((s) => s != null)
        : [];
    if (selections.some((s) => s.contested === true && s.mode == "pick")) {
        present.add("convergence.selections");
    }
    return present;
}

// Derive the record's defensible framework annotations client-side — the same PURE,
// truthfully-filtered mapping the backend export pack emits. An annotation appears
// iff every required section is present; corroborating refs join only when present.
function deriveFrameworkAnnotations(record: unknown): FrameworkAnnotationView[] {
    const present = frameworkPresentSections(record);
    const out: FrameworkAnnotationView[] = [];
    for (const mapping of FrameworkControlCatalog) {
        if (!mapping.required.every((section) => present.has(section))) {
            continue;
        }
        const corroborating = (mapping.corroborating ?? []).filter((section) => present.has(section));
        out.push({
            framework: mapping.framework,
            control: mapping.control,
            satisfiedBy: [...mapping.required, ...corroborating],
            rationale: mapping.rationale,
        });
    }
    return out;
}

// The compliance-mapping section of the downloaded summary: per framework, the
// controls this run's evidence supports with the backing sections + rationale. When
// nothing is defensibly supported it says so — a truthful gap, never a hollow claim.
function summarizeFrameworks(record: unknown): string[] {
    const annotations = deriveFrameworkAnnotations(record);
    if (annotations.length == 0) {
        return [
            "Compliance mapping: none — this run's evidence doesn't defensibly support any catalogued control (not a certification).",
        ];
    }
    const lines = [`Compliance mapping — controls this run's evidence supports (${annotations.length}, not a certification):`];
    for (const group of groupFrameworks(annotations)) {
        lines.push(`  ${group.framework}:`);
        for (const c of group.controls) {
            lines.push(`    - ${c.control}: ${c.rationale} [backed by: ${c.satisfiedBy.join(", ")}]`);
        }
    }
    return lines;
}

// The human-readable section of the export file, built client-side from the sealed
// record (the backend pack's summary covers controls, not the per-file story):
// what ran, which agents, contested files + how each was resolved (picked vs
// assisted synthesize), the governance verdict, and the seal hashes. PURE +
// degrade-truthful: an absent field reads as its honest gap, never a guess.
function buildEvidenceSummary(record: unknown): string[] {
    const root = asObject(record) ?? {};
    const evidence = asObject(root.evidence) ?? {};
    const seal = asObject(root.seal) ?? {};
    const provenance = asObject(evidence.provenance) ?? {};
    const lines: string[] = ["Recoder convergence evidence — human summary (the `sealed` block is the artifact of record)."];

    const taskId = stringOr(evidence.taskId, "");
    const taskGroup = stringOr(evidence.taskGroup, "");
    lines.push(`Run: task ${taskId == "" ? "(none)" : taskId} · group ${taskGroup == "" ? "(ungrouped)" : taskGroup}`);
    const mergedAt = stringOr(provenance.mergedAt, EvidenceSummaryUnknown);
    const actorId = stringOr(provenance.actorId, EvidenceSummaryUnknown);
    lines.push(`Merged: workspace ${stringOr(evidence.chosenWorkspaceId, EvidenceSummaryUnknown)} at ${mergedAt} by ${actorId}`);

    const candidates = Array.isArray(evidence.candidates)
        ? evidence.candidates.map(asObject).filter((c) => c != null)
        : [];
    if (candidates.length == 0) {
        lines.push("Agents: no candidate runs recorded.");
    } else {
        lines.push(`Agents (${candidates.length}):`);
        for (const c of candidates) {
            const label = agentLabel(stringOr(c.agent, EvidenceSummaryUnknown));
            const chosen = c.chosen === true ? "chosen" : "not chosen";
            lines.push(`  - ${label} · ${stringOr(c.workspaceId, EvidenceSummaryUnknown)} · ${chosen} · state ${stringOr(c.state, EvidenceSummaryUnknown)}`);
        }
    }

    lines.push(...summarizeContested(evidence, candidates));
    lines.push(...summarizeGovernance(asObject(evidence.governance)));
    lines.push(...summarizeVerification(asObject(evidence.verification)));
    lines.push(...summarizeFrameworks(root));

    const contentHash = stringOr(evidence.contentHash, "");
    lines.push(contentHash == "" ? "Seal: no content hash — the record is unsealed." : `Seal: content hash ${contentHash}`);
    const auditEntryHash = stringOr(seal.auditEntryHash, "");
    lines.push(auditEntryHash == "" ? "Audit: no durable audit seal recorded." : `Audit: durable audit seal ${auditEntryHash}`);
    return lines;
}

const SealPrefixLength = 12;

function evidenceSealPrefix(record: unknown): string {
    const evidence = asObject(asObject(record)?.evidence) ?? {};
    const hash = stringOr(evidence.contentHash, "");
    return hash == "" ? "unsealed" : hash.slice(0, SealPrefixLength);
}

function evidenceExportFilename(workspaceId: string, record: unknown): string {
    return `recoder-evidence-${sanitizeForFilename(workspaceId)}-${sanitizeForFilename(evidenceSealPrefix(record))}.json`;
}

const EvidenceFileSchema = "recoder.evidence-file/v1";

// The one-file export: the backend's sealed record VERBATIM under `sealed` (its
// contentHash still re-verifies) plus the client-built human summary alongside —
// two artifacts, one JSON.
function buildEvidenceExportFile(workspaceId: string, record: Record<string, unknown>): Record<string, unknown> {
    return {
        schema: EvidenceFileSchema,
        workspaceId,
        summary: buildEvidenceSummary(record),
        sealed: record,
    };
}

// The affordance gate: export is only offered once a real evidence pack loaded —
// a no-evidence / errored / still-loading panel truthfully shows no export button.
function canExportEvidence(view: EvidenceExportView): boolean {
    return view != null;
}

export {
    buildEvidenceExportFile,
    buildEvidenceSummary,
    canExportEvidence,
    cryptoVerifyEd25519,
    deriveFrameworkAnnotations,
    deriveSignatureStatus,
    deriveVerifiedSignature,
    evidenceExportFilename,
    evidenceFilename,
    fetchEvidenceExport,
    fetchEvidenceMarkdown,
    fetchEvidenceRecord,
    fetchPreviewVerification,
    groupFrameworks,
    normalizeStatus,
    parseEvidenceExport,
    parsePreviewVerification,
    previewVerificationStateAtom,
    signaturePublicKeyFingerprint,
    triggerTextDownload,
    type EvidenceControlView,
    type EvidenceCoverage,
    type EvidenceExportResult,
    type EvidenceExportView,
    type EvidenceMarkdownResult,
    type EvidenceRecordResult,
    type EvidenceSignatureView,
    type EvidenceStatus,
    type FrameworkAnnotationView,
    type FrameworkGroup,
    type PreviewCheckRow,
    type PreviewVerificationFailure,
    type PreviewVerificationResult,
    type PreviewVerificationState,
    type PreviewVerificationViewModel,
    type SignatureState,
    type SignatureStatus,
};
