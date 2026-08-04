// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure composition of the workspace-context block the Wave AI panel prepends to
// a conversation, built ONLY from the focused Recoder board's already-derived
// read models. Truthful degrade throughout: an absent datum drops its line —
// this module never fabricates a repo, state, or diff count. Nothing here
// touches jotai, fetch, or globalStore.

import { agentLabel } from "./recoder-agent-labels";
import type { RecoderDiffSummary, RecoderWorkspace } from "./recoder-board-logic";

// A lenient mirror of one GET /workspaces/:id/diff/files entry (backend
// WorkspaceDiffFile). Binary files carry null counts — their line then shows
// the bare path, never a fabricated +0/-0.
type WorkspaceContextFile = {
    path?: string;
    insertions?: number | null;
    deletions?: number | null;
};

type WorkspaceContextInput = {
    workspace?: RecoderWorkspace;
    diffSummary?: RecoderDiffSummary;
    diffFiles?: WorkspaceContextFile[];
};

// The composed block plus the identity the panel indicator shows. `text` is the
// full context block WITHOUT the attach label (see workspaceContextMessageText).
type WorkspaceAIContext = {
    workspaceId: string;
    codename: string;
    text: string;
};

const MaxContextFiles = 20;
const WorkspaceContextLabel = "[Recoder workspace context — attached by the terminal, once per conversation]";

// The human handle for a workspace: the launch task title when one was stamped,
// else the branch, else the raw id (always non-empty for a real workspace).
function workspaceCodename(ws: RecoderWorkspace): string {
    const title = typeof ws.metadata?.title == "string" ? ws.metadata.title.trim() : "";
    if (title != "") {
        return title;
    }
    const branch = (ws.branch ?? "").trim();
    return branch != "" ? branch : ws.workspaceId;
}

function pushFact(facts: string[], label: string, value: string) {
    const v = (value ?? "").trim();
    if (v == "") {
        return;
    }
    facts.push(`${label} ${v}`);
}

function formatFileLine(file: WorkspaceContextFile): string {
    const counts =
        typeof file.insertions == "number" && typeof file.deletions == "number"
            ? ` (+${file.insertions}/-${file.deletions})`
            : "";
    return `- ${file.path}${counts}`;
}

// The "Files changed" section from the per-file diff read. [] when the list is
// absent/empty/unusable, so the caller can fall back to the aggregate summary
// or omit the section entirely.
function formatChangedFileLines(diffFiles: WorkspaceContextFile[]): string[] {
    const files = (diffFiles ?? []).filter((f) => typeof f?.path == "string" && f.path != "");
    if (files.length == 0) {
        return [];
    }
    const shown = files.slice(0, MaxContextFiles);
    const lines = [`Files changed (${files.length}):`, ...shown.map(formatFileLine)];
    if (files.length > MaxContextFiles) {
        lines.push(`- …and ${files.length - MaxContextFiles} more`);
    }
    return lines;
}

// Compose the context block. null when there is no workspace to describe — the
// panel then attaches nothing rather than an empty shell. Facts and the files
// section each degrade independently: absent data is omitted, never invented.
function buildWorkspaceAIContext(input: WorkspaceContextInput): WorkspaceAIContext {
    const ws = input?.workspace;
    if (ws == null || (ws.workspaceId ?? "") == "") {
        return null;
    }
    const codename = workspaceCodename(ws);
    const facts: string[] = [];
    pushFact(facts, "repo", ws.projectId);
    pushFact(facts, "branch", ws.branch);
    pushFact(facts, "agent", ws.runtimeId != null && ws.runtimeId != "" ? agentLabel(ws.runtimeId) : "");
    pushFact(facts, "state", ws.state);
    const header =
        facts.length > 0
            ? `The user is looking at Recoder workspace ${codename} (${facts.join(", ")}).`
            : `The user is looking at Recoder workspace ${codename}.`;
    const lines = [header];
    const fileLines = formatChangedFileLines(input.diffFiles);
    if (fileLines.length > 0) {
        lines.push(...fileLines);
    } else if (input.diffSummary != null) {
        const s = input.diffSummary;
        lines.push(`Files changed: ${s.files} (+${s.additions}/-${s.deletions}).`);
    }
    return { workspaceId: ws.workspaceId, codename, text: lines.join("\n") };
}

// One attach per (conversation, workspace): attach when a context exists, the
// user has not detached it, the conversation is real, and this conversation has
// not already received THIS workspace's context. Keying on chatId+workspace
// (not chatId alone) keeps the indicator truthful — selecting a different
// workspace re-attaches once for the new one instead of silently promising a
// context that would never be sent. Pure — the caller records the attach by
// remembering the key it passed.
function workspaceContextAttachKey(chatId: string, context: WorkspaceAIContext): string {
    return context == null ? "" : `${chatId}::${context.workspaceId}`;
}

function shouldAttachWorkspaceContext(
    attachedKey: string,
    chatId: string,
    detached: boolean,
    context: WorkspaceAIContext
): boolean {
    if (detached || context == null) {
        return false;
    }
    if (chatId == null || chatId == "") {
        return false;
    }
    return attachedKey != workspaceContextAttachKey(chatId, context);
}

function workspaceContextMessageText(context: WorkspaceAIContext): string {
    return `${WorkspaceContextLabel}\n${context.text}`;
}

// The quiet one-line indicator: "" when there is nothing to show, the codename
// while attached, and an explicit off-state while the user has it detached.
function workspaceContextIndicatorLabel(context: WorkspaceAIContext, detached: boolean): string {
    if (context == null) {
        return "";
    }
    return detached ? "context: off" : `context: ${context.codename}`;
}

export {
    buildWorkspaceAIContext,
    formatChangedFileLines,
    MaxContextFiles,
    shouldAttachWorkspaceContext,
    workspaceCodename,
    workspaceContextAttachKey,
    workspaceContextIndicatorLabel,
    WorkspaceContextLabel,
    workspaceContextMessageText,
    type WorkspaceAIContext,
    type WorkspaceContextFile,
    type WorkspaceContextInput,
};
