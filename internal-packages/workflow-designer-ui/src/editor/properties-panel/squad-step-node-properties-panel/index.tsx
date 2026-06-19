import {
	type SquadStepNode,
	SquadStepStrategy,
	type SquadStepStrategy as SquadStepStrategyType,
} from "@recoder/protocol";
import {
	useDeleteNode,
	useUpdateNodeData,
	useUpdateNodeDataContent,
} from "../../../app-designer";
import { PropertiesPanelContent, PropertiesPanelRoot } from "../ui";
import { NodePanelHeader } from "../ui/node-panel-header";
import { SettingDetail, SettingLabel } from "../ui/setting-label";

const strategyLabels: Record<SquadStepStrategyType, string> = {
	all: "All members",
	leader: "Leader",
	"round-robin": "Round robin",
	"best-match": "Best match",
};

const inputClassName =
	"w-full rounded-[8px] border border-white/10 bg-[color-mix(in_srgb,var(--color-text-inverse,#fff)_10%,transparent)] px-[10px] py-[8px] text-[13px] text-inverse outline-none placeholder:text-text-muted focus:border-action-node-1";

export function SquadStepNodePropertiesPanel({
	node,
}: {
	node: SquadStepNode;
}) {
	const updateNodeData = useUpdateNodeData();
	const updateNodeDataContent = useUpdateNodeDataContent();
	const deleteNode = useDeleteNode();

	return (
		<PropertiesPanelRoot>
			<NodePanelHeader
				node={node}
				onChangeName={(name) => updateNodeData(node, { name })}
				onDelete={() => deleteNode(node.id)}
			/>
			<PropertiesPanelContent>
				<div className="flex flex-col gap-[16px] pb-[12px]">
					<div className="flex flex-col gap-[8px]">
						<SettingLabel htmlFor={`${node.id}-squad-id`}>
							Squad ID
						</SettingLabel>
						<input
							id={`${node.id}-squad-id`}
							className={inputClassName}
							value={node.content.squadId}
							placeholder="squad_build"
							onChange={(event) =>
								updateNodeDataContent<SquadStepNode>(node, {
									squadId: event.target.value,
								})
							}
						/>
						<SettingDetail size="sm" colorClassName="text-text-muted">
							Workflow execution requires a saved squad id from the collaboration
							layer.
						</SettingDetail>
					</div>

					<div className="flex flex-col gap-[8px]">
						<SettingLabel htmlFor={`${node.id}-task`}>Task</SettingLabel>
						<textarea
							id={`${node.id}-task`}
							className={`${inputClassName} min-h-[128px] resize-y leading-[1.5]`}
							value={node.content.task}
							placeholder="Describe the task for the squad. You can use {{_lastOutput}} from previous steps."
							onChange={(event) =>
								updateNodeDataContent<SquadStepNode>(node, {
									task: event.target.value,
								})
							}
						/>
					</div>

					<div className="flex flex-col gap-[8px]">
						<SettingLabel htmlFor={`${node.id}-strategy`}>
							Dispatch Strategy
						</SettingLabel>
						<select
							id={`${node.id}-strategy`}
							className={inputClassName}
							value={node.content.strategy}
							onChange={(event) => {
								const strategy = SquadStepStrategy.parse(event.target.value);
								updateNodeDataContent<SquadStepNode>(node, { strategy });
							}}
						>
							{SquadStepStrategy.options.map((strategy) => (
								<option key={strategy} value={strategy}>
									{strategyLabels[strategy]}
								</option>
							))}
						</select>
					</div>
				</div>
			</PropertiesPanelContent>
		</PropertiesPanelRoot>
	);
}
