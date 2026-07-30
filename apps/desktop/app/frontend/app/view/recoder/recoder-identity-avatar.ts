// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure initials for the identity avatar's monogram fallback (shown when Better
// Auth has no image yet). Prefers the name (first + last word initials), falls
// back to the email local-part's first letter, then "?" — never empty, never a
// throw. Kept pure so it is unit-tested without rendering.
function identityInitials(name?: string, email?: string): string {
    const n = (name ?? "").trim();
    if (n != "") {
        const words = n.split(/\s+/).filter((w) => w != "");
        if (words.length >= 2) {
            return (words[0][0] + words[words.length - 1][0]).toUpperCase();
        }
        if (words.length == 1) {
            return words[0].slice(0, 2).toUpperCase();
        }
    }
    const e = (email ?? "").trim();
    if (e != "") {
        const local = e.split("@")[0];
        if (local != "") {
            return local[0].toUpperCase();
        }
    }
    return "?";
}

export { identityInitials };
