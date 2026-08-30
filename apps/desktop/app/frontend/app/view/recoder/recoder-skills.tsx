// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useState } from "react";
import { getRecoderBackendUrl } from "./recoder-endpoints";
import { readFetchError } from "./recoder-errors";
import { INPUT, PRIMARY_BTN, QUIET_BTN_XS, SECTION_TITLE } from "./recoder-styles";
import skillStyleModule from "./recoder-skills.module.css";

const styles = skillStyleModule as unknown as Record<string, string>;

type SkillParam = {
    name: string;
    type: "string" | "number" | "boolean";
    required: boolean;
    enum?: string[];
};

type SkillAction = {
    id: string;
    title: string;
    requiredCapabilities: string[];
    params: SkillParam[];
};

type VerifiedSkill = {
    id: string;
    version: string;
    publisherKeyId: string;
    actions: SkillAction[];
};

type SkillInvocation =
    | { status: "refused"; refused: true; reason: string }
    | { status: "needs_approval"; requestId: string; reason: string }
    | { status: "executed"; result: { ok: boolean; output?: unknown; error?: string } };

type LoadState = "loading" | "ready" | "unavailable";

type SkillPublisher = {
    keyId: string;
    fingerprint: string;
    source: "first_party" | "environment" | "operator";
    removable: boolean;
    skillCount: number;
    addedAt?: string;
};

type SkillTrust = {
    durable: boolean;
    publishers: SkillPublisher[];
    admissions: Array<{ id: string; ok: boolean; reason?: string }>;
};

type SkillEvidence = {
    id: string;
    startedAt: string;
    completedAt?: string;
    durationMs?: number;
    actorId: string;
    target: { workspaceId: string; worktree?: string };
    skill: {
        id: string;
        actionId: string;
        version?: string;
        publisherKeyId?: string;
        capabilities: string[];
    };
    params: unknown;
    phase: string;
    policy: { effect: string; reason?: string; profileRevision?: number };
    outcome: { status: string; reason?: string; requestId?: string; result?: unknown };
    contentHash: string;
    integrity: "verified" | "invalid";
};

type SkillEvidenceView = {
    durable: boolean;
    total: number;
    invocations: SkillEvidence[];
};

type PolicyEffect = "allow" | "needs_approval" | "deny";

type WorkspacePolicyProfile = {
    version: 1;
    revision: number;
    defaultToolEffect: PolicyEffect;
    toolRules: Array<{ toolName: string; effect: PolicyEffect; reason?: string }>;
    swarm: { autoAnswer: boolean; minConfidence: number };
    updatedAt?: string;
    updatedBy?: string;
};

type WorkspacePolicyView = {
    persisted: boolean;
    valid: boolean;
    profile: WorkspacePolicyProfile;
};

function isPolicyEffect(value: unknown): value is PolicyEffect {
    return value == "allow" || value == "needs_approval" || value == "deny";
}

function parsePolicy(value: unknown): WorkspacePolicyView | null {
    if (value == null || typeof value != "object") return null;
    const view = value as Partial<WorkspacePolicyView>;
    const profile = view.profile as Partial<WorkspacePolicyProfile> | undefined;
    if (!profile || profile.version != 1 || typeof profile.revision != "number" ||
        !isPolicyEffect(profile.defaultToolEffect) || !Array.isArray(profile.toolRules) ||
        !profile.swarm || typeof profile.swarm.autoAnswer != "boolean" ||
        typeof profile.swarm.minConfidence != "number") return null;
    const toolRules = profile.toolRules.filter((candidate): candidate is WorkspacePolicyProfile["toolRules"][number] =>
        candidate != null && typeof candidate == "object" && typeof candidate.toolName == "string" &&
        isPolicyEffect(candidate.effect) && (candidate.reason == null || typeof candidate.reason == "string")
    );
    if (toolRules.length != profile.toolRules.length) return null;
    return {
        persisted: view.persisted === true,
        valid: view.valid !== false,
        profile: { ...profile, toolRules } as WorkspacePolicyProfile,
    };
}

function copyPolicy(profile: WorkspacePolicyProfile): WorkspacePolicyProfile {
    return {
        ...profile,
        toolRules: profile.toolRules.map((rule) => ({ ...rule })),
        swarm: { ...profile.swarm },
    };
}

function parseTrust(value: unknown): SkillTrust | null {
    if (value == null || typeof value != "object") return null;
    const trust = value as Partial<SkillTrust>;
    if (!Array.isArray(trust.publishers) || !Array.isArray(trust.admissions)) return null;
    const publishers = trust.publishers.filter((candidate): candidate is SkillPublisher =>
        candidate != null && typeof candidate == "object" &&
        typeof candidate.keyId == "string" && typeof candidate.fingerprint == "string" &&
        (candidate.source == "first_party" || candidate.source == "environment" || candidate.source == "operator") &&
        typeof candidate.removable == "boolean" && typeof candidate.skillCount == "number"
    );
    return { durable: trust.durable === true, publishers, admissions: trust.admissions };
}

function parseEvidence(value: unknown): SkillEvidenceView | null {
    if (value == null || typeof value != "object") return null;
    const view = value as Partial<SkillEvidenceView>;
    if (typeof view.total != "number" || !Array.isArray(view.invocations)) return null;
    const invocations = view.invocations.filter((candidate): candidate is SkillEvidence => {
        if (candidate == null || typeof candidate != "object") return false;
        const row = candidate as Partial<SkillEvidence>;
        return typeof row.id == "string" && typeof row.startedAt == "string" &&
            typeof row.actorId == "string" && typeof row.contentHash == "string" &&
            (row.integrity == "verified" || row.integrity == "invalid") &&
            row.target != null && typeof row.target == "object" && typeof row.target.workspaceId == "string" &&
            row.skill != null && typeof row.skill == "object" && typeof row.skill.id == "string" &&
            typeof row.skill.actionId == "string" && Array.isArray(row.skill.capabilities) &&
            row.policy != null && typeof row.policy == "object" && typeof row.policy.effect == "string" &&
            row.outcome != null && typeof row.outcome == "object" && typeof row.outcome.status == "string";
    });
    return { durable: view.durable === true, total: view.total, invocations };
}

function displayTimestamp(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function evidenceJson(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function isParam(value: unknown): value is SkillParam {
    if (value == null || typeof value != "object") return false;
    const row = value as Partial<SkillParam>;
    return (
        typeof row.name == "string" &&
        (row.type == "string" || row.type == "number" || row.type == "boolean") &&
        typeof row.required == "boolean" &&
        (row.enum == null || (Array.isArray(row.enum) && row.enum.every((item) => typeof item == "string")))
    );
}

function parseSkills(value: unknown): VerifiedSkill[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((candidate) => {
        if (candidate == null || typeof candidate != "object") return [];
        const skill = candidate as Partial<VerifiedSkill>;
        if (
            typeof skill.id != "string" ||
            typeof skill.version != "string" ||
            typeof skill.publisherKeyId != "string" ||
            !Array.isArray(skill.actions)
        ) {
            return [];
        }
        const actions = skill.actions.flatMap((candidateAction) => {
            if (candidateAction == null || typeof candidateAction != "object") return [];
            const action = candidateAction as Partial<SkillAction>;
            if (
                typeof action.id != "string" ||
                typeof action.title != "string" ||
                !Array.isArray(action.params) ||
                !action.params.every(isParam) ||
                !Array.isArray(action.requiredCapabilities) ||
                !action.requiredCapabilities.every((item) => typeof item == "string")
            ) {
                return [];
            }
            return [{ ...action, params: action.params, requiredCapabilities: action.requiredCapabilities } as SkillAction];
        });
        return [{ id: skill.id, version: skill.version, publisherKeyId: skill.publisherKeyId, actions }];
    });
}

function skillLabel(id: string): string {
    return id
        .replace(/^recoder[._-]?/i, "")
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ") || id;
}

function actionKey(skillId: string, actionId: string): string {
    return `${skillId}\u0000${actionId}`;
}

function invocationText(invocation: SkillInvocation): { tone: "normal" | "error"; label: string; detail?: unknown } {
    if (invocation.status == "refused") {
        return { tone: "error", label: `Refused — ${invocation.reason}` };
    }
    if (invocation.status == "needs_approval") {
        return {
            tone: "normal",
            label: `Approval requested — ${invocation.reason}`,
            detail: { requestId: invocation.requestId },
        };
    }
    if (!invocation.result.ok) {
        return { tone: "error", label: invocation.result.error || "Skill execution failed" };
    }
    return { tone: "normal", label: "Completed", detail: invocation.result.output };
}

function RecoderSkills({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
    const [loadState, setLoadState] = useState<LoadState>("loading");
    const [skills, setSkills] = useState<VerifiedSkill[]>([]);
    const [error, setError] = useState("");
    const [selected, setSelected] = useState("");
    const [values, setValues] = useState<Record<string, string | boolean>>({});
    const [running, setRunning] = useState(false);
    const [invocation, setInvocation] = useState<SkillInvocation | null>(null);
    const [catalogRevision, setCatalogRevision] = useState(0);
    const [activeView, setActiveView] = useState<"actions" | "policy" | "trust">("actions");
    const [trust, setTrust] = useState<SkillTrust | null>(null);
    const [trustLoading, setTrustLoading] = useState(false);
    const [trustError, setTrustError] = useState("");
    const [publisherId, setPublisherId] = useState("");
    const [publisherKey, setPublisherKey] = useState("");
    const [manifestText, setManifestText] = useState("");
    const [trustSaving, setTrustSaving] = useState(false);
    const [pendingRevoke, setPendingRevoke] = useState("");
    const [evidence, setEvidence] = useState<SkillEvidenceView | null>(null);
    const [evidenceLoading, setEvidenceLoading] = useState(false);
    const [evidenceError, setEvidenceError] = useState("");
    const [evidenceRevision, setEvidenceRevision] = useState(0);
    const [policy, setPolicy] = useState<WorkspacePolicyView | null>(null);
    const [policyDraft, setPolicyDraft] = useState<WorkspacePolicyProfile | null>(null);
    const [policyLoading, setPolicyLoading] = useState(false);
    const [policySaving, setPolicySaving] = useState(false);
    const [policyError, setPolicyError] = useState("");
    const showTrust = activeView == "trust";
    const showPolicy = activeView == "policy";

    useEffect(() => {
        let cancelled = false;
        setLoadState("loading");
        setError("");
        setSkills([]);
        setSelected("");
        setInvocation(null);
        void (async () => {
            try {
                const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/skills`);
                if (!res.ok) {
                    const reason = await readFetchError(res);
                    throw new Error(reason || `Skills unavailable (${res.status})`);
                }
                const body = await res.json();
                const parsed = parseSkills(body?.data?.skills);
                if (cancelled) return;
                setSkills(parsed);
                const first = parsed.flatMap((skill) => skill.actions.map((action) => actionKey(skill.id, action.id)))[0];
                setSelected(first ?? "");
                setLoadState("ready");
            } catch (caught) {
                if (cancelled) return;
                setError(caught instanceof Error ? caught.message : String(caught));
                setLoadState("unavailable");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [workspaceId, catalogRevision]);

    useEffect(() => {
        if (!showTrust) return;
        let cancelled = false;
        setTrustLoading(true);
        setTrustError("");
        void (async () => {
            try {
                const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/skills/trust`);
                if (!res.ok) {
                    const reason = await readFetchError(res);
                    throw new Error(reason || `Trust registry unavailable (${res.status})`);
                }
                const parsed = parseTrust((await res.json())?.data?.trust);
                if (!parsed) throw new Error("Trust registry response was incomplete");
                if (!cancelled) setTrust(parsed);
            } catch (caught) {
                if (!cancelled) setTrustError(caught instanceof Error ? caught.message : String(caught));
            } finally {
                if (!cancelled) setTrustLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [catalogRevision, showTrust]);

    useEffect(() => {
        if (!showTrust) return;
        let cancelled = false;
        setEvidenceLoading(true);
        setEvidenceError("");
        void (async () => {
            try {
                const url = `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/skills/invocations?limit=50`;
                const res = await fetch(url);
                if (!res.ok) {
                    const reason = await readFetchError(res);
                    throw new Error(reason || `Invocation evidence unavailable (${res.status})`);
                }
                const parsed = parseEvidence((await res.json())?.data?.evidence);
                if (!parsed) throw new Error("Invocation evidence response was incomplete");
                if (!cancelled) setEvidence(parsed);
            } catch (caught) {
                if (!cancelled) setEvidenceError(caught instanceof Error ? caught.message : String(caught));
            } finally {
                if (!cancelled) setEvidenceLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [evidenceRevision, showTrust, workspaceId]);

    useEffect(() => {
        setPolicy(null);
        setPolicyDraft(null);
        setPolicyError("");
    }, [workspaceId]);

    useEffect(() => {
        if (!showPolicy || policy != null) return;
        let cancelled = false;
        setPolicyLoading(true);
        setPolicyError("");
        void (async () => {
            try {
                const url = `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/policy`;
                const res = await fetch(url);
                if (!res.ok) {
                    const reason = await readFetchError(res);
                    throw new Error(reason || `Workspace policy unavailable (${res.status})`);
                }
                const parsed = parsePolicy((await res.json())?.data?.policy);
                if (!parsed) throw new Error("Workspace policy response was incomplete");
                if (!cancelled) {
                    setPolicy(parsed);
                    setPolicyDraft(copyPolicy(parsed.profile));
                }
            } catch (caught) {
                if (!cancelled) setPolicyError(caught instanceof Error ? caught.message : String(caught));
            } finally {
                if (!cancelled) setPolicyLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [policy, showPolicy, workspaceId]);

    const selection = useMemo(() => {
        for (const skill of skills) {
            for (const action of skill.actions) {
                if (actionKey(skill.id, action.id) == selected) return { skill, action };
            }
        }
        return null;
    }, [selected, skills]);

    const governedTools = useMemo(() => {
        const tools = new Map<string, { toolName: string; label: string; source: string }>();
        tools.set("swarm.unblock", {
            toolName: "swarm.unblock",
            label: "Swarm auto-unblock",
            source: "Workspace automation",
        });
        for (const skill of skills) {
            for (const action of skill.actions) {
                const toolName = `skill.${skill.id}.${action.id}`;
                tools.set(toolName, { toolName, label: action.title, source: `${skill.id} · v${skill.version}` });
            }
        }
        for (const rule of policyDraft?.toolRules ?? []) {
            if (!tools.has(rule.toolName)) {
                tools.set(rule.toolName, { toolName: rule.toolName, label: rule.toolName, source: "Stored override" });
            }
        }
        return [...tools.values()];
    }, [policyDraft?.toolRules, skills]);

    const policyDirty = policy != null && policyDraft != null &&
        JSON.stringify(policy.profile) != JSON.stringify(policyDraft);

    const setPolicyEffect = (toolName: string, effect: PolicyEffect) => {
        setPolicyDraft((current) => {
            if (!current) return current;
            const existing = current.toolRules.find((rule) => rule.toolName == toolName);
            const others = current.toolRules.filter((rule) => rule.toolName != toolName);
            return {
                ...current,
                toolRules: effect == current.defaultToolEffect
                    ? others
                    : [...others, { toolName, effect, ...(existing?.reason ? { reason: existing.reason } : {}) }]
                        .sort((a, b) => a.toolName.localeCompare(b.toolName)),
            };
        });
    };

    const setPolicyReason = (toolName: string, reason: string) => {
        setPolicyDraft((current) => current ? {
            ...current,
            toolRules: current.toolRules.map((rule) => {
                if (rule.toolName != toolName) return rule;
                const { reason: _previous, ...withoutReason } = rule;
                return reason ? { ...withoutReason, reason } : withoutReason;
            }),
        } : current);
    };

    const savePolicy = async () => {
        if (!policyDraft || policySaving || !policyDirty) return;
        setPolicySaving(true);
        setPolicyError("");
        try {
            const url = `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/policy`;
            const res = await fetch(url, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    expectedRevision: policyDraft.revision,
                    defaultToolEffect: policyDraft.defaultToolEffect,
                    toolRules: policyDraft.toolRules,
                    swarm: policyDraft.swarm,
                }),
            });
            if (!res.ok) {
                const reason = await readFetchError(res);
                throw new Error(reason || `Workspace policy could not be saved (${res.status})`);
            }
            const parsed = parsePolicy((await res.json())?.data?.policy);
            if (!parsed) throw new Error("Saved workspace policy response was incomplete");
            setPolicy(parsed);
            setPolicyDraft(copyPolicy(parsed.profile));
        } catch (caught) {
            setPolicyError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setPolicySaving(false);
        }
    };

    useEffect(() => {
        const initial: Record<string, string | boolean> = {};
        for (const param of selection?.action.params ?? []) {
            if (param.type == "boolean") initial[param.name] = false;
        }
        setValues(initial);
        setInvocation(null);
    }, [selection]);

    const missingRequired =
        selection?.action.params.some((param) => {
            if (!param.required) return false;
            const value = values[param.name];
            return param.type == "boolean" ? typeof value != "boolean" : typeof value != "string" || value.trim() == "";
        }) ?? true;

    const run = async () => {
        if (selection == null || running || missingRequired) return;
        setRunning(true);
        setInvocation(null);
        setError("");
        const params: Record<string, string | number | boolean> = {};
        for (const param of selection.action.params) {
            const value = values[param.name];
            if (param.type == "boolean") {
                if (typeof value == "boolean") params[param.name] = value;
            } else if (typeof value == "string" && value.trim() != "") {
                params[param.name] = param.type == "number" ? Number(value) : value;
            }
        }
        try {
            const url = `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/skills/${encodeURIComponent(selection.skill.id)}/actions/${encodeURIComponent(selection.action.id)}`;
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ params }),
            });
            if (!res.ok) {
                const reason = await readFetchError(res);
                throw new Error(reason || `Skill invocation failed (${res.status})`);
            }
            const body = await res.json();
            setInvocation(body?.data?.invocation as SkillInvocation);
            setEvidenceRevision((value) => value + 1);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setRunning(false);
        }
    };

    const outcome = invocation == null ? null : invocationText(invocation);

    const addPublisher = async () => {
        if (!publisherId.trim() || !publisherKey.trim() || trustSaving) return;
        setTrustSaving(true);
        setTrustError("");
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/skills/publishers`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ keyId: publisherId.trim(), publicKey: publisherKey.trim() }),
            });
            if (!res.ok) throw new Error((await readFetchError(res)) || `Could not trust publisher (${res.status})`);
            setPublisherId("");
            setPublisherKey("");
            setCatalogRevision((value) => value + 1);
        } catch (caught) {
            setTrustError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setTrustSaving(false);
        }
    };

    const admitManifest = async () => {
        if (!manifestText.trim() || trustSaving) return;
        setTrustSaving(true);
        setTrustError("");
        try {
            let manifest: unknown;
            try {
                manifest = JSON.parse(manifestText);
            } catch {
                throw new Error("Manifest must be valid JSON");
            }
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/skills/manifests`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ manifest }),
            });
            if (!res.ok) throw new Error((await readFetchError(res)) || `Manifest admission failed (${res.status})`);
            const outcome = (await res.json())?.data?.outcome as { ok?: boolean; reason?: string } | undefined;
            if (!outcome?.ok) throw new Error(`Manifest rejected${outcome?.reason ? ` — ${outcome.reason}` : ""}`);
            setManifestText("");
            setCatalogRevision((value) => value + 1);
        } catch (caught) {
            setTrustError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setTrustSaving(false);
        }
    };

    const revokePublisher = async (keyId: string) => {
        if (pendingRevoke != keyId) {
            setPendingRevoke(keyId);
            return;
        }
        setTrustSaving(true);
        setTrustError("");
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/skills/publishers/${encodeURIComponent(keyId)}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error((await readFetchError(res)) || `Could not remove publisher (${res.status})`);
            setPendingRevoke("");
            setCatalogRevision((value) => value + 1);
        } catch (caught) {
            setTrustError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setTrustSaving(false);
        }
    };

    return (
        <section className="shrink-0 border-b border-border bg-panel/20" aria-label="Workspace skills">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                    <div className={SECTION_TITLE}>Workspace skills</div>
                    <div className="text-xs text-meta">Verified, typed actions for this workspace</div>
                </div>
                <div className="flex items-center gap-2">
                    <button className={QUIET_BTN_XS} aria-pressed={activeView == "actions"} onClick={() => setActiveView("actions")}>Actions</button>
                    <button className={QUIET_BTN_XS} aria-pressed={activeView == "policy"} onClick={() => setActiveView("policy")}>Policy</button>
                    <button className={QUIET_BTN_XS} aria-pressed={activeView == "trust"} onClick={() => setActiveView("trust")}>Trust ledger</button>
                    <button className={QUIET_BTN_XS} onClick={onClose} aria-label="Close workspace skills">Close</button>
                </div>
            </div>
            {showTrust && (
                <div className={styles.ledger}>
                    <div className={styles.ledgerHero}>
                        <div className={`${styles.metric} ${styles.metricPrimary}`}>
                            <strong>{evidence?.total ?? "—"}</strong>
                            <span>Workspace invocations</span>
                        </div>
                        <div className={styles.metric}>
                            <strong>{trust?.publishers.length ?? "—"}</strong>
                            <span>Trusted publishers</span>
                        </div>
                        <div className={styles.ledgerTitle}>
                            <strong>Skill trust ledger</strong>
                            <span>
                                {evidence && trust
                                    ? `Invocation evidence ${evidence.durable ? "durable" : "process-only"} · publisher registry ${trust.durable ? "durable" : "process-only"}`
                                    : "Loading publisher and invocation records"}
                            </span>
                        </div>
                    </div>
                    {trustLoading && <div className={styles.message}>Loading trust registry…</div>}
                    {trustError && <div className={styles.ledgerError}>{trustError}</div>}
                    {trust && <div className={styles.publisherGrid}>
                        {trust.publishers.map((publisher, index) => (
                            <div className={styles.publisherRow} key={publisher.keyId}>
                                <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
                                <div>
                                    <strong>{publisher.keyId}</strong>
                                    <span>{publisher.source.replace("_", " ")} · {publisher.skillCount} skill{publisher.skillCount == 1 ? "" : "s"}</span>
                                    <code>SHA256 {publisher.fingerprint}</code>
                                </div>
                                {publisher.removable && (
                                    <button disabled={trustSaving} onClick={() => void revokePublisher(publisher.keyId)}>
                                        {pendingRevoke == publisher.keyId ? "Confirm remove" : "Remove"}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>}
                    <div className={styles.evidenceSection}>
                        <div className={styles.evidenceHeading}>
                            <h3>Invocation evidence</h3>
                            <span>{evidence ? `${evidence.invocations.length} shown · ${evidence.total} total` : "Loading records"}</span>
                        </div>
                        {evidenceLoading && <div className={styles.message}>Loading invocation evidence…</div>}
                        {evidenceError && <div className={styles.ledgerError}>{evidenceError}</div>}
                        {evidence && evidence.invocations.length == 0 && (
                            <div className={styles.message}>No governed skill has been invoked in this workspace.</div>
                        )}
                        {evidence?.invocations.map((record, index) => (
                            <details className={styles.evidenceRow} key={record.id} data-status={record.outcome.status}>
                                <summary>
                                    <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
                                    <div className={styles.evidenceIdentity}>
                                        <strong>{record.skill.id} / {record.skill.actionId}</strong>
                                        <span>{displayTimestamp(record.startedAt)} · {record.actorId}</span>
                                    </div>
                                    <div className={styles.evidenceVerdict}>
                                        <strong>{record.outcome.status.replace("_", " ")}</strong>
                                        <span>
                                            Policy {record.policy.effect.replace("_", " ")} · {record.phase}
                                            {record.policy.profileRevision != null ? ` · profile r${record.policy.profileRevision}` : ""}
                                        </span>
                                    </div>
                                    <span className={styles.rowAction}>View evidence</span>
                                </summary>
                                <div className={styles.evidenceBody}>
                                    <dl>
                                        <div><dt>Workspace</dt><dd>{record.target.workspaceId}</dd></div>
                                        {record.target.worktree && <div><dt>Resolved target</dt><dd>{record.target.worktree}</dd></div>}
                                        {record.skill.version && <div><dt>Version</dt><dd>{record.skill.version}</dd></div>}
                                        {record.skill.publisherKeyId && <div><dt>Publisher</dt><dd>{record.skill.publisherKeyId}</dd></div>}
                                        <div><dt>Capabilities</dt><dd>{record.skill.capabilities.join(", ") || "None"}</dd></div>
                                        {record.durationMs != null && <div><dt>Duration</dt><dd>{record.durationMs} ms</dd></div>}
                                        <div><dt>Integrity</dt><dd data-integrity={record.integrity}>{record.integrity}</dd></div>
                                    </dl>
                                    <div className={styles.hash}><strong>SHA-256</strong><code>{record.contentHash}</code></div>
                                    {record.policy.reason && <div className={styles.evidenceReason}><strong>Policy reason</strong><span>{record.policy.reason}</span></div>}
                                    {record.outcome.reason && <div className={styles.evidenceReason}><strong>Outcome</strong><span>{record.outcome.reason}</span></div>}
                                    <div className={styles.evidencePayloads}>
                                        <div><strong>Parameters</strong><pre>{evidenceJson(record.params)}</pre></div>
                                        <div><strong>Evidence</strong><pre>{evidenceJson(record.outcome)}</pre></div>
                                    </div>
                                </div>
                            </details>
                        ))}
                    </div>
                    {trust && (
                        <>
                            <div className={styles.onboardingGrid}>
                                <div className={styles.formBlock}>
                                    <h3>Add publisher</h3>
                                    <label>
                                        <span>Key ID</span>
                                        <input value={publisherId} onChange={(event) => setPublisherId(event.target.value)} placeholder="company.team" />
                                    </label>
                                    <label>
                                        <span>Ed25519 public key</span>
                                        <textarea value={publisherKey} onChange={(event) => setPublisherKey(event.target.value)} rows={3} />
                                    </label>
                                    <button disabled={trustSaving || !publisherId.trim() || !publisherKey.trim()} onClick={() => void addPublisher()}>
                                        Add publisher
                                    </button>
                                </div>
                                <div className={styles.formBlock}>
                                    <h3>Admit signed manifest</h3>
                                    <label>
                                        <span>Manifest JSON</span>
                                        <textarea value={manifestText} onChange={(event) => setManifestText(event.target.value)} rows={7} />
                                    </label>
                                    <button disabled={trustSaving || !manifestText.trim()} onClick={() => void admitManifest()}>
                                        Admit manifest
                                    </button>
                                </div>
                            </div>
                            {trust.admissions.some((admission) => !admission.ok) && (
                                <div className={styles.admissions}>
                                    <strong>Rejected admissions</strong>
                                    {trust.admissions.filter((admission) => !admission.ok).map((admission, index) => (
                                        <span key={`${admission.id}:${index}`}>{admission.id} · {admission.reason || "rejected"}</span>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
            {showPolicy && (
                <div className={styles.policyLedger}>
                    <div className={styles.policyHero}>
                        <div className={`${styles.metric} ${styles.metricPrimary}`}>
                            <strong>{policyDraft?.toolRules.length ?? "—"}</strong>
                            <span>Explicit rules</span>
                        </div>
                        <div className={styles.policyTitle}>
                            <strong>Workspace policy</strong>
                            <span>
                                {policyDraft
                                    ? `${policy?.persisted ? `Revision ${policyDraft.revision}` : "Default profile"} · unmatched actions ${policyDraft.defaultToolEffect.replace("_", " ")}`
                                    : "Loading workspace policy"}
                            </span>
                        </div>
                    </div>
                    {policyLoading && <div className={styles.message}>Loading workspace policy…</div>}
                    {policyError && <div className={styles.ledgerError}>{policyError}</div>}
                    {policy && !policy.valid && (
                        <div className={styles.ledgerError}>The stored profile was invalid. Recoder is using the default profile until this form is saved.</div>
                    )}
                    {policyDraft && (
                        <>
                            <div className={styles.policyControls}>
                                <label>
                                    <span>Unmatched governed actions</span>
                                    <select
                                        value={policyDraft.defaultToolEffect}
                                        onChange={(event) => setPolicyDraft((current) => current ? {
                                            ...current,
                                            defaultToolEffect: event.target.value as PolicyEffect,
                                        } : current)}
                                    >
                                        <option value="allow">Allow</option>
                                        <option value="needs_approval">Require approval</option>
                                        <option value="deny">Deny</option>
                                    </select>
                                </label>
                                <label className={styles.checkboxControl}>
                                    <span>Swarm auto-answer</span>
                                    <input
                                        type="checkbox"
                                        checked={policyDraft.swarm.autoAnswer}
                                        onChange={(event) => setPolicyDraft((current) => current ? {
                                            ...current,
                                            swarm: { ...current.swarm, autoAnswer: event.target.checked },
                                        } : current)}
                                    />
                                    <small>Only low-risk, evidenced sibling precedents can pass.</small>
                                </label>
                                <label>
                                    <span>Minimum confidence</span>
                                    <input
                                        type="number"
                                        min="0.01"
                                        max="1"
                                        step="0.01"
                                        value={policyDraft.swarm.minConfidence}
                                        onChange={(event) => {
                                            const value = Number(event.target.value);
                                            setPolicyDraft((current) => current && Number.isFinite(value) ? {
                                                ...current,
                                                swarm: { ...current.swarm, minConfidence: value },
                                            } : current);
                                        }}
                                    />
                                </label>
                            </div>
                            <div className={styles.policyHeading}>
                                <div>
                                    <h3>Governed actions</h3>
                                    <span>{governedTools.length} available or stored</span>
                                </div>
                                <div className={styles.policyActions}>
                                    <button disabled={!policyDirty || policySaving} onClick={() => policy && setPolicyDraft(copyPolicy(policy.profile))}>Discard changes</button>
                                    <button disabled={!policyDirty || policySaving} onClick={() => void savePolicy()}>{policySaving ? "Saving…" : "Save policy"}</button>
                                </div>
                            </div>
                            <div className={styles.policyRules}>
                                {governedTools.map((tool, index) => {
                                    const override = policyDraft.toolRules.find((rule) => rule.toolName == tool.toolName);
                                    const selectedEffect = override?.effect ?? policyDraft.defaultToolEffect;
                                    return (
                                        <div className={styles.policyRule} key={tool.toolName} data-effect={selectedEffect}>
                                            <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
                                            <div className={styles.policyIdentity}>
                                                <strong>{tool.label}</strong>
                                                <span>{tool.source}</span>
                                                <code>{tool.toolName}</code>
                                            </div>
                                            <label>
                                                <span>Decision</span>
                                                <select value={selectedEffect} onChange={(event) => setPolicyEffect(tool.toolName, event.target.value as PolicyEffect)}>
                                                    <option value="allow">Allow</option>
                                                    <option value="needs_approval">Require approval</option>
                                                    <option value="deny">Deny</option>
                                                </select>
                                            </label>
                                            <label>
                                                <span>Reason</span>
                                                <input
                                                    value={override?.reason ?? ""}
                                                    disabled={!override}
                                                    onChange={(event) => setPolicyReason(tool.toolName, event.target.value)}
                                                />
                                            </label>
                                        </div>
                                    );
                                })}
                            </div>
                            {policyDraft.updatedAt && (
                                <div className={styles.policyFooter}>
                                    Updated {displayTimestamp(policyDraft.updatedAt)}{policyDraft.updatedBy ? ` by ${policyDraft.updatedBy}` : ""}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
            {activeView == "actions" && <>
            {loadState == "loading" && <div className="px-3 pb-3 text-xs text-secondary">Loading verified skills…</div>}
            {loadState == "unavailable" && <div className="px-3 pb-3 text-xs text-error">{error}</div>}
            {loadState == "ready" && skills.length == 0 && (
                <div className="px-3 pb-3 text-xs text-secondary">No verified skills are available.</div>
            )}
            {loadState == "ready" && skills.length > 0 && (
                <div className="flex max-h-[22rem] flex-wrap gap-3 overflow-auto border-t border-white/[0.05] p-3">
                    <div className="flex min-w-[9rem] flex-1 basis-40 flex-col gap-3">
                        {skills.map((skill) => (
                            <div key={skill.id} className="min-w-0">
                                <div className="mb-1 flex items-baseline justify-between gap-2">
                                    <span className="truncate text-xs font-medium text-primary" title={skill.id}>
                                        {skillLabel(skill.id)}
                                    </span>
                                    <span className="shrink-0 text-[10px] text-meta">v{skill.version}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    {skill.actions.map((action) => {
                                        const key = actionKey(skill.id, action.id);
                                        return (
                                            <button
                                                key={action.id}
                                                className={`rounded border px-2 py-1 text-left text-xs recoder-transition ${
                                                    selected == key
                                                        ? "border-accent/40 bg-accent/15 text-primary"
                                                        : "border-white/8 text-secondary hover:bg-border/40 hover:text-primary"
                                                }`}
                                                onClick={() => setSelected(key)}
                                            >
                                                {action.title}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                    {selection != null && (
                        <div className="min-w-[14rem] flex-[2_1_18rem] rounded border border-white/8 p-3">
                            <div className="text-sm font-medium text-primary">{selection.action.title}</div>
                            <div className="mt-0.5 text-[11px] text-meta">
                                {selection.action.requiredCapabilities.join(" · ")}
                            </div>
                            <div className="mt-3 flex flex-col gap-2">
                                {selection.action.params.length == 0 && (
                                    <div className="text-xs text-secondary">This action has no inputs.</div>
                                )}
                                {selection.action.params.map((param) => (
                                    <label key={param.name} className="flex flex-col gap-1 text-xs text-secondary">
                                        <span>
                                            {param.name}
                                            {param.required ? " *" : ""}
                                        </span>
                                        {param.type == "boolean" ? (
                                            <input
                                                type="checkbox"
                                                checked={values[param.name] === true}
                                                onChange={(event) =>
                                                    setValues((current) => ({ ...current, [param.name]: event.target.checked }))
                                                }
                                                className="self-start accent-accent"
                                            />
                                        ) : param.enum != null ? (
                                            <select
                                                value={typeof values[param.name] == "string" ? String(values[param.name]) : ""}
                                                onChange={(event) =>
                                                    setValues((current) => ({ ...current, [param.name]: event.target.value }))
                                                }
                                                className={INPUT}
                                            >
                                                <option value="">Select…</option>
                                                {param.enum.map((option) => (
                                                    <option key={option} value={option}>
                                                        {option}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type={param.type == "number" ? "number" : "text"}
                                                value={typeof values[param.name] == "string" ? String(values[param.name]) : ""}
                                                onChange={(event) =>
                                                    setValues((current) => ({ ...current, [param.name]: event.target.value }))
                                                }
                                                placeholder={param.name == "dir" ? "." : undefined}
                                                className={INPUT}
                                            />
                                        )}
                                    </label>
                                ))}
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                                <button className={PRIMARY_BTN} onClick={() => void run()} disabled={running || missingRequired}>
                                    {running ? "Running…" : "Run skill"}
                                </button>
                                <span className="text-[11px] text-meta">{selection.skill.publisherKeyId}</span>
                            </div>
                            {error != "" && <div className="mt-2 text-xs text-error">{error}</div>}
                            {outcome != null && (
                                <div className="mt-3 border-t border-white/[0.05] pt-2">
                                    <div className={`text-xs ${outcome.tone == "error" ? "text-error" : "text-accent"}`}>
                                        {outcome.label}
                                    </div>
                                    {outcome.detail !== undefined && (
                                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/20 p-2 text-[11px] text-secondary">
                                            {typeof outcome.detail == "string"
                                                ? outcome.detail
                                                : JSON.stringify(outcome.detail, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            </>}
        </section>
    );
}

RecoderSkills.displayName = "RecoderSkills";

export { RecoderSkills };
