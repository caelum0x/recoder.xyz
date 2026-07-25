// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure logic for the "Open GitHub project" clone flow. Mirrors (never replaces)
// the backend's validation on POST /api/conductor/repos/clone — the backend owns
// the truth; this only pre-validates so the modal can fail fast without a round
// trip, and parses the edge's response without ever fabricating a success.

import { readErrorReason } from "./recoder-errors";

const GITHUB_HTTPS_RE = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/;
const GITHUB_SSH_RE = /^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/;

function matchGitHubUrl(url: string): { owner: string; repo: string } {
    const trimmed = (url ?? "").trim();
    const m = GITHUB_HTTPS_RE.exec(trimmed) ?? GITHUB_SSH_RE.exec(trimmed);
    if (m == null) {
        return null;
    }
    const owner = m[1];
    const repo = m[2];
    if (owner == "" || repo == "" || repo == "." || repo == "..") {
        return null;
    }
    return { owner, repo };
}

function isGitHubRepoUrl(url: string): boolean {
    return matchGitHubUrl(url) != null;
}

// The clone's final directory leaf — mirrors the backend's destDir/<repo-name>.
function repoNameFromUrl(url: string): string {
    const m = matchGitHubUrl(url);
    return m == null ? "" : m.repo;
}

// Recent-repo entries are LOCAL paths, so a GitHub URL is only derivable when a
// stored entry is itself already an obvious GitHub URL; a local path yields ""
// (we never guess a remote from a folder name).
function deriveGitHubUrl(entry: string): string {
    const m = matchGitHubUrl(entry);
    if (m == null) {
        return "";
    }
    return `https://github.com/${m.owner}/${m.repo}`;
}

type CloneParseResult = { ok: boolean; repoPath?: string; clonedWith?: string; error?: string };

// Truthful parse of the clone edge's { success, data: { repoPath, clonedWith } }
// envelope. A 200 without a usable repoPath is treated as a failure (never open a
// folder we weren't given); every error branch prefers the backend's own message
// and falls back to a status-scoped truthful line, never generic fake progress.
function parseCloneResponse(status: number, body: unknown): CloneParseResult {
    const b = body as { success?: unknown; data?: { repoPath?: unknown; clonedWith?: unknown } };
    if (status == 200 && b?.success == true) {
        const repoPath = typeof b.data?.repoPath == "string" ? b.data.repoPath.trim() : "";
        if (repoPath == "") {
            return { ok: false, error: "Clone reported success but returned no folder." };
        }
        const raw = b.data?.clonedWith;
        const clonedWith = typeof raw == "string" && (raw == "gh" || raw == "git") ? raw : "";
        return { ok: true, repoPath, ...(clonedWith != "" ? { clonedWith } : {}) };
    }
    const reason = readErrorReason(body);
    if (reason != "") {
        return { ok: false, error: reason };
    }
    if (status == 400) {
        return { ok: false, error: "That doesn't look like a GitHub repository URL." };
    }
    if (status == 409) {
        return { ok: false, error: "The target folder already exists and isn't empty." };
    }
    if (status == 503) {
        return { ok: false, error: "Cloning needs the GitHub CLI (gh) or git installed on PATH." };
    }
    return { ok: false, error: `Clone failed (HTTP ${status}).` };
}

export { deriveGitHubUrl, isGitHubRepoUrl, matchGitHubUrl, parseCloneResponse, repoNameFromUrl, type CloneParseResult };
