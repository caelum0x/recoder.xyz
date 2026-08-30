// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Synthetic ad-hoc compare ids are provenance labels, not persisted task groups.
// Keep the decode in one place so every deep compare read routes to the explicit-id
// backend edge instead of accidentally querying an empty taskGroup.
const AD_HOC_GROUP_PREFIX = "adhoc:";

function adHocWorkspaceIds(taskGroup: string): string[] {
    const group = (taskGroup ?? "").trim();
    if (!group.startsWith(AD_HOC_GROUP_PREFIX)) {
        return [];
    }
    return group
        .slice(AD_HOC_GROUP_PREFIX.length)
        .split("+")
        .map((id) => id.trim())
        .filter((id) => id != "");
}

export { AD_HOC_GROUP_PREFIX, adHocWorkspaceIds };
