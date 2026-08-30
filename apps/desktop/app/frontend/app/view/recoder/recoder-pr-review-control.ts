export type PrReviewControlAction = "start" | "pause" | "scan" | "configure";

export type PrReviewLaunchProfile = {
    repoPath: string;
    spaceId: string;
    projectId: string;
    runtimeId: string;
};

/**
 * Keep a standing watcher pinned while the operator moves around the Board.
 * Only an explicit start with a valid current selection repins an existing
 * watcher. A first scan/configure may establish the initial target.
 */
export function buildPrReviewControlBody(input: {
    action: PrReviewControlAction;
    includeDrafts: boolean;
    pinnedProfile: PrReviewLaunchProfile | null;
    selectedProfile: PrReviewLaunchProfile | null;
    reviewerRuntimeIds: string[];
}): Record<string, unknown> {
    const shouldPin = input.selectedProfile != null &&
        (input.action == "start" || input.pinnedProfile == null);
    return {
        action: input.action,
        ...(input.action == "configure" ? { includeDrafts: input.includeDrafts } : {}),
        ...(shouldPin ? {
            profile: input.selectedProfile,
            reviewerRuntimeIds: input.reviewerRuntimeIds,
            includeDrafts: input.includeDrafts,
        } : {}),
    };
}
