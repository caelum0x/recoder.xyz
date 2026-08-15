// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock } from "@/app/store/global";
import type { RecoderDetailFace } from "./recoder-detail-header";

const WorkspaceIdMetaKey = "recoder:workspaceid";
const DetailFaceMetaKey = "recoder:detailface";

function workspaceDetailMeta(face: RecoderDetailFace, workspaceId?: string): Record<string, unknown> {
    const id = typeof workspaceId == "string" ? workspaceId.trim() : "";
    return {
        view: "recoder-detail",
        [DetailFaceMetaKey]: face,
        ...(id != "" ? { [WorkspaceIdMetaKey]: id } : {}),
    };
}

async function openWorkspaceDetail(face: RecoderDetailFace, workspaceId?: string): Promise<void> {
    try {
        await createBlock({ meta: workspaceDetailMeta(face, workspaceId) });
    } catch {
        // Opening a detail surface is an affordance; failure never invalidates work.
    }
}

export { DetailFaceMetaKey, openWorkspaceDetail, workspaceDetailMeta, WorkspaceIdMetaKey };
