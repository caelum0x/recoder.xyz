import type { NodeLike } from "@recoder/protocol";
import {
	isActionNode,
	isTriggerNode,
	isVectorStoreNode,
} from "@recoder/protocol";
import type { ReactElement } from "react";
import { useGitHubVectorStoreStatus } from "../../lib/use-github-vector-store-status";
import {
	GitHubRepositoryBadge,
	GitHubRepositoryBadgeFromRepo,
	GitHubRepositoryBadgeFromTrigger,
} from "./";
import { RequiresSetupBadge } from "./requires-setup-badge";

export function GitHubNodeInfo({
	node,
}: {
	node: NodeLike;
}): ReactElement | null {
	const unknownNode = node as any;
	const { isOrphaned: isVectorStoreOrphaned, isEmbeddingProfileOrphaned } =
		useGitHubVectorStoreStatus(node);

	if (isTriggerNode(node, "github")) {
		return unknownNode.content?.state?.status === "configured" ? (
			<div className="px-[16px] relative">
				<GitHubRepositoryBadgeFromTrigger
					triggerId={unknownNode.content.state.flowTriggerId}
				/>
			</div>
		) : (
			<RequiresSetupBadge />
		);
	}

	if (isActionNode(node, "github")) {
		const command = unknownNode.content?.command as
			| {
					state?: {
						status?: string;
						installationId?: number | string;
						repositoryNodeId?: string;
					};
			  }
			| undefined;
		const installationId = Number(command?.state?.installationId);
		const repositoryNodeId = command?.state?.repositoryNodeId;
		const isConfiguredRepo =
			command?.state?.status === "configured" &&
			Number.isFinite(installationId) &&
			typeof repositoryNodeId === "string" &&
			repositoryNodeId.length > 0;

		return isConfiguredRepo ? (
			<div className="px-[16px] relative">
				<GitHubRepositoryBadgeFromRepo
					installationId={installationId}
					repositoryNodeId={repositoryNodeId}
				/>
			</div>
		) : (
			<RequiresSetupBadge />
		);
	}

	if (isVectorStoreNode(node, "github")) {
		return unknownNode.content?.source?.state?.status === "configured" &&
			!isVectorStoreOrphaned &&
			!isEmbeddingProfileOrphaned ? (
			<div className="px-[16px] relative">
				<GitHubRepositoryBadge
					owner={unknownNode.content.source.state.owner}
					repo={unknownNode.content.source.state.repo}
					nodeType="vectorStore"
				/>
			</div>
		) : (
			<RequiresSetupBadge />
		);
	}

	return null;
}
