// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { BlockNodeModel } from "@/app/block/blocktypes";
import type { TabModel } from "@/app/store/tab-model";
import { AiFileDiffViewModel } from "@/app/view/aifilediff/aifilediff";
import { LauncherViewModel } from "@/app/view/launcher/launcher";
import { PreviewModel } from "@/app/view/preview/preview-model";
import { ProcessViewerViewModel } from "@/app/view/processviewer/processviewer";
import { SysinfoViewModel } from "@/app/view/sysinfo/sysinfo";
import { TsunamiViewModel } from "@/app/view/tsunami/tsunami";
import { VDomModel } from "@/app/view/vdom/vdom-model";
import { WaveEnv } from "@/app/waveenv/waveenv";
import { atom } from "jotai";
import { QuickTipsViewModel } from "../view/quicktipsview/quicktipsview";
import { WaveConfigViewModel } from "../view/waveconfig/waveconfig-model";
import { blockViewToIcon, blockViewToName } from "./blockutil";
import { HelpViewModel } from "@/view/helpview/helpview";
import { RecoderViewModel } from "@/app/view/recoder/recoder-model";
import { RecoderTerminalViewModel } from "@/app/view/recoder/recoder-terminal-model";
import { RecoderDiffViewModel } from "@/app/view/recoder-diff/recoder-diff-model";
import { RecoderAgentsViewModel } from "@/app/view/recoder-agents/recoder-agents-model";
import { RecoderAuditViewModel } from "@/app/view/recoder-audit/recoder-audit-model";
import { RecoderBoardViewModel } from "@/app/view/recoder-board/recoder-board-model";
import { RecoderCapabilitiesViewModel } from "@/app/view/recoder-capabilities/recoder-capabilities-model";
import { RecoderCodebaseViewModel } from "@/app/view/recoder-codebase/recoder-codebase-model";
import { RecoderFanoutViewModel } from "@/app/view/recoder-fanout/recoder-fanout-model";
import { RecoderIngestViewModel } from "@/app/view/recoder-ingest/recoder-ingest-model";
import { RecoderLocksViewModel } from "@/app/view/recoder-locks/recoder-locks-model";
import { RecoderMemoryViewModel } from "@/app/view/recoder-memory/recoder-memory-model";
import { RecoderNeedsYouViewModel } from "@/app/view/recoder-needs-you/recoder-needs-you-model";
import { RecoderPlaybooksViewModel } from "@/app/view/recoder-playbooks/recoder-playbooks-model";
import { RecoderSiblingsViewModel } from "@/app/view/recoder-siblings/recoder-siblings-model";
import { RecoderSwarmViewModel } from "@/app/view/recoder-swarm/recoder-swarm-model";
import { RecoderRunsViewModel } from "@/app/view/recoder-runs/recoder-runs-model";
import { RecoderSettingsViewModel } from "@/app/view/recoder-settings/recoder-settings-model";
import { RecoderUsageViewModel } from "@/app/view/recoder-usage/recoder-usage-model";
import { RecoderWorkflowsViewModel } from "@/app/view/recoder-workflows/recoder-workflows-model";
import { TermViewModel } from "@/view/term/term-model";
import { WaveAiModel } from "@/view/waveai/waveai";
import { WebViewModel } from "@/view/webview/webview";

const BlockRegistry: Map<string, ViewModelClass> = new Map();
BlockRegistry.set("term", TermViewModel);
BlockRegistry.set("preview", PreviewModel);
BlockRegistry.set("web", WebViewModel);
BlockRegistry.set("waveai", WaveAiModel);
BlockRegistry.set("cpuplot", SysinfoViewModel);
BlockRegistry.set("sysinfo", SysinfoViewModel);
BlockRegistry.set("vdom", VDomModel);
BlockRegistry.set("tips", QuickTipsViewModel);
BlockRegistry.set("help", HelpViewModel);
BlockRegistry.set("launcher", LauncherViewModel);
BlockRegistry.set("tsunami", TsunamiViewModel);
BlockRegistry.set("aifilediff", AiFileDiffViewModel);
BlockRegistry.set("waveconfig", WaveConfigViewModel);
BlockRegistry.set("processviewer", ProcessViewerViewModel);
BlockRegistry.set("recoder", RecoderViewModel);
BlockRegistry.set("recoder-terminal", RecoderTerminalViewModel);
BlockRegistry.set("recoder-diff", RecoderDiffViewModel);
BlockRegistry.set("recoder-board", RecoderBoardViewModel);
BlockRegistry.set("recoder-memory", RecoderMemoryViewModel);
BlockRegistry.set("recoder-codebase", RecoderCodebaseViewModel);
BlockRegistry.set("recoder-fanout", RecoderFanoutViewModel);
BlockRegistry.set("recoder-playbooks", RecoderPlaybooksViewModel);
BlockRegistry.set("recoder-swarm", RecoderSwarmViewModel);
BlockRegistry.set("recoder-needs-you", RecoderNeedsYouViewModel);
BlockRegistry.set("recoder-siblings", RecoderSiblingsViewModel);
BlockRegistry.set("recoder-ingest", RecoderIngestViewModel);
BlockRegistry.set("recoder-capabilities", RecoderCapabilitiesViewModel);
BlockRegistry.set("recoder-locks", RecoderLocksViewModel);
BlockRegistry.set("recoder-audit", RecoderAuditViewModel);
BlockRegistry.set("recoder-workflows", RecoderWorkflowsViewModel);
BlockRegistry.set("recoder-agents", RecoderAgentsViewModel);
BlockRegistry.set("recoder-usage", RecoderUsageViewModel);
BlockRegistry.set("recoder-runs", RecoderRunsViewModel);
BlockRegistry.set("recoder-settings", RecoderSettingsViewModel);
// Retired views (recoder-tools/-hands/-openfang/-connectors/-health/-launch, and
// the standalone recoder-approvals tab whose approvals now surface inline on the
// diff/session stream) were removed; an old saved layout referencing one falls
// through to a neutral default view (makeDefaultViewModel), never a crash.

function makeDefaultViewModel(viewType: string): ViewModel {
    const viewModel: ViewModel = {
        viewType: viewType,
        viewIcon: atom(blockViewToIcon(viewType)),
        viewName: atom(blockViewToName(viewType)),
        preIconButton: atom(null),
        endIconButtons: atom(null),
        viewComponent: null,
    };
    return viewModel;
}

function makeViewModel(
    blockId: string,
    blockView: string,
    nodeModel: BlockNodeModel,
    tabModel: TabModel,
    waveEnv: WaveEnv
): ViewModel {
    const ctor = BlockRegistry.get(blockView);
    if (ctor != null) {
        return new ctor({ blockId, nodeModel, tabModel, waveEnv });
    }
    return makeDefaultViewModel(blockView);
}

export { makeViewModel };
