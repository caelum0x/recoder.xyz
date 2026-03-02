import type { LanguageModelProvider } from "@recoder/language-model";
import type { GiselleLogger } from "@recoder/logger";
import type {
	GenerationOrigin,
	RunningGeneration,
	Task,
	WorkspaceId,
} from "@recoder/protocol";
import type { GiselleStorage } from "@recoder/storage";
import type { Vault } from "@recoder/vault";
import type { GenerationMetadata } from "../generations";
import type { TelemetrySettings } from "../telemetry";
import type { GiselleCallbacks } from "./callbacks";
import type { ApiSecretScryptConfig } from "./config";
import type { GitHubIntegrationConfig } from "./integrations";
import type { VectorStoreQueryServices } from "./query-services";
import type {
	ConsumeAgentTimeCallback,
	FetchUsageLimitsFn,
} from "./usage-limits";
import type { WaitUntil } from "./wait-until";

type GenerateContentArgs = {
	context: GiselleContext;
	generation: RunningGeneration;
	metadata?: GenerationMetadata;
};

type GenerateContentProcess =
	| { type: "self" }
	| { type: "external"; process: (args: GenerateContentArgs) => Promise<void> };

export type SetRunTaskProcessArgs = {
	context: GiselleContext;
	task: Task;
	generationOriginType: GenerationOrigin["type"];
};

type RunTaskProcess =
	| { type: "self" }
	| {
			type: "external";
			process: (args: SetRunTaskProcessArgs) => Promise<void>;
	  };

export type RunTask = (args: SetRunTaskProcessArgs) => Promise<void>;

export interface GiselleContext {
	storage: GiselleStorage;
	sampleAppWorkspaceIds?: WorkspaceId[];
	llmProviders: LanguageModelProvider[];
	apiSecretScrypt?: ApiSecretScryptConfig;
	integrationConfigs?: {
		github?: GitHubIntegrationConfig;
	};
	onConsumeAgentTime?: ConsumeAgentTimeCallback;
	fetchUsageLimitsFn?: FetchUsageLimitsFn;
	telemetry?: {
		isEnabled?: boolean;
		waitForFlushFn?: () => Promise<unknown>;
		metadata?: TelemetrySettings["metadata"];
	};
	vault: Vault;
	vectorStoreQueryServices?: VectorStoreQueryServices;
	callbacks?: Omit<
		GiselleCallbacks,
		"generationComplete" | "generationError" | "taskCreate"
	>;
	logger: GiselleLogger;
	waitUntil: WaitUntil;
	generateContentProcess: GenerateContentProcess;
	runTaskProcess: RunTaskProcess;
	experimental_contentGenerationNode: boolean;
}
