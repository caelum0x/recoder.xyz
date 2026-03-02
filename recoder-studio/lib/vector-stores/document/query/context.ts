import type { EmbeddingProfileId, WorkspaceId } from "@recoder/protocol";

import type { DocumentVectorStoreId } from "@/packages/types";

export interface DocumentVectorStoreQueryContext {
	provider: "document";
	workspaceId: WorkspaceId;
	documentVectorStoreId: DocumentVectorStoreId;
	embeddingProfileId: EmbeddingProfileId;
}
