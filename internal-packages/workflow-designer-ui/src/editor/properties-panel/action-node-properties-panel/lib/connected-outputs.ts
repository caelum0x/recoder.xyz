import type {
	ConnectionId,
	Input,
	NodeLike,
	Output,
} from "@recoder/protocol";

export type InputWithConnectedOutput = Input & {
	connectedOutput?: Output & { node: NodeLike } & {
		connectionId: ConnectionId;
	};
};
