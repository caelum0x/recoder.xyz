// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure parsing for the zero-config GitHub half of onboarding: the token-free
// identity from GET /api/conductor/github/status and the detected account's
// clonable repo list from GET /api/conductor/github/repos. The backend owns the
// truth; these only coerce its untrusted payloads into view shapes, degrading
// every malformed field to a truthful nothing — never a fabricated identity or
// repo, so a gh-less machine simply falls back to the paste flow.

type RecoderGithubStatus = {
    connected: boolean;
    // "GH_TOKEN" | "GITHUB_TOKEN" | "gh_cli" | "" (not connected / unknown)
    source: string;
    login: string;
    name: string;
    email: string;
};

type RecoderGithubRepo = { name: string; nameWithOwner: string; url: string };

function asString(v: unknown): string {
    return typeof v == "string" ? v : "";
}

// null (not an object payload) means "status unknown" — callers keep retrying
// rather than caching a fabricated not-connected verdict.
function parseGithubStatus(data: unknown): RecoderGithubStatus {
    if (data == null || typeof data != "object") {
        return null;
    }
    const d = data as Record<string, unknown>;
    const account = (d.account != null && typeof d.account == "object" ? d.account : {}) as Record<string, unknown>;
    return {
        connected: d.connected == true,
        source: asString(d.source),
        login: asString(account.login),
        name: asString(account.name),
        email: asString(account.email),
    };
}

// The edge wraps the list as { repos: [...] }. Malformed entries are dropped,
// a malformed payload yields [] — an empty pick list, never a broken picker.
function parseGithubRepos(data: unknown): RecoderGithubRepo[] {
    const repos = (data as { repos?: unknown })?.repos;
    if (!Array.isArray(repos)) {
        return [];
    }
    return repos.flatMap((entry): RecoderGithubRepo[] => {
        if (entry == null || typeof entry != "object") {
            return [];
        }
        const { name, nameWithOwner, url } = entry as Record<string, unknown>;
        if (typeof name != "string" || name == "") {
            return [];
        }
        if (typeof nameWithOwner != "string" || nameWithOwner == "") {
            return [];
        }
        if (typeof url != "string" || url == "") {
            return [];
        }
        return [{ name, nameWithOwner, url }];
    });
}

// One truthful identity line for the pickers: the gh login when present, else
// the git config name; "" when nothing was detected (caller renders nothing).
function githubIdentityLabel(status: RecoderGithubStatus): string {
    if (status == null) {
        return "";
    }
    return status.login != "" ? status.login : status.name;
}

// Repos whose name matches a recent LOCAL folder's leaf are dropped from the
// clone-on-pick list: re-cloning over an existing folder is a guaranteed 409,
// and the recents chip beside the list already opens the local copy.
function filterClonableRepos(repos: RecoderGithubRepo[], recentRepos: string[]): RecoderGithubRepo[] {
    const leafs = new Set(
        recentRepos
            .map((p) => (p ?? "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "")
            .filter((s) => s != "")
    );
    return repos.filter((r) => !leafs.has(r.name));
}

export {
    filterClonableRepos,
    githubIdentityLabel,
    parseGithubRepos,
    parseGithubStatus,
    type RecoderGithubRepo,
    type RecoderGithubStatus,
};
