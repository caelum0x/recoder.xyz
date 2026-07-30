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
import { RecoderLaunchViewModel } from "@/app/view/recoder-launch/recoder-launch-model";
import { RecoderApprovalsViewModel } from "@/app/view/recoder-approvals/recoder-approvals-model";
import { RecoderDiffViewModel } from "@/app/view/recoder-diff/recoder-diff-model";
import { RecoderBoardViewModel } from "@/app/view/recoder-board/recoder-board-model";
import { RecoderMemoryViewModel } from "@/app/view/recoder-memory/recoder-memory-model";
import { RecoderRunsViewModel } from "@/app/view/recoder-runs/recoder-runs-model";
import { RetiredViewModel } from "@/app/view/retired/retired";
import { RecoderSettingsViewModel } from "@/app/view/recoder-settings/recoder-settings-model";
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
BlockRegistry.set("recoder-launch", RecoderLaunchViewModel);
BlockRegistry.set("recoder-approvals", RecoderApprovalsViewModel);
BlockRegistry.set("recoder-diff", RecoderDiffViewModel);
BlockRegistry.set("recoder-board", RecoderBoardViewModel);
// recoder-tools / recoder-hands / recoder-connectors: retired infra dashboards
// (OpenHands-derived "hands", OSS engine names, green success pills) — tombstoned
// like recoder-openfang per rule 4b + the "no infra dashboards" north star, so a
// saved layout renders the tombstone instead of the dashboard. Files kept (owner
// precedent); their bg-success greens are now unreachable.
BlockRegistry.set("recoder-tools", RetiredViewModel);
BlockRegistry.set("recoder-memory", RecoderMemoryViewModel);
BlockRegistry.set("recoder-runs", RecoderRunsViewModel);
BlockRegistry.set("recoder-hands", RetiredViewModel);
BlockRegistry.set("recoder-openfang", RetiredViewModel);
BlockRegistry.set("recoder-connectors", RetiredViewModel);
BlockRegistry.set("recoder-settings", RecoderSettingsViewModel);

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
