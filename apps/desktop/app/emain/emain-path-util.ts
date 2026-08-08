// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Expand a LEADING `~` (the current user's home) in a filesystem path.
 *
 * Only a `~` that stands alone or is immediately followed by a `/` is treated
 * as the home shorthand — `~user` (another account's home) and any `~` that
 * appears later in the path are left untouched. This is deliberately anchored:
 * an unanchored `String.replace("~", home)` rewrites the FIRST `~` anywhere in
 * the string, corrupting legitimate paths like `/data/file~backup`
 * (recoder-f8pn).
 */
export function expandLeadingTilde(filePath: string, homeDir: string): string {
    if (filePath === "~") return homeDir;
    if (filePath.startsWith("~/")) return homeDir + filePath.slice(1);
    return filePath;
}
