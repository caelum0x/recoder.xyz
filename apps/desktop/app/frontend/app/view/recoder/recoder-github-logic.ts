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

// Backend REPO_LIST_LIMIT (github-status.adapter.ts) — the /github/repos edge
// never returns more than this many repos, so a full-length list means the
// account likely has more repos than were listed. Keep the two in sync.
const GithubRepoListCap = 100;

// Both pickers render at most this many chips; the typeahead filter narrows
// the FULL fetched list, so every fetched repo stays reachable by typing.
const RepoChipDisplayLimit = 12;

// Case-insensitive substring match over nameWithOwner (same client-side
// pattern as the board search) — empty/whitespace query means "no filter".
function filterReposByQuery(repos: RecoderGithubRepo[], query: string): RecoderGithubRepo[] {
    const q = query.trim().toLowerCase();
    if (q == "") {
        return repos;
    }
    return repos.filter((r) => r.nameWithOwner.toLowerCase().includes(q));
}

// The truthful "you are not seeing everything" line under the chips: overflow
// beyond the chip limit and/or the backend cap being hit. "" when the chips
// already show everything the account has.
function repoPickerHint(matchCount: number, totalCount: number): string {
    const parts: string[] = [];
    if (matchCount > RepoChipDisplayLimit) {
        parts.push(`Showing ${RepoChipDisplayLimit} of ${matchCount} — type to filter`);
    }
    if (totalCount >= GithubRepoListCap) {
        parts.push(`List capped at your ${GithubRepoListCap} most recently pushed repos`);
    }
    return parts.join(" · ");
}

export {
    filterClonableRepos,
    filterReposByQuery,
    GithubRepoListCap,
    githubIdentityLabel,
    parseGithubRepos,
    parseGithubStatus,
    RepoChipDisplayLimit,
    repoPickerHint,
    type RecoderGithubRepo,
    type RecoderGithubStatus,
};
