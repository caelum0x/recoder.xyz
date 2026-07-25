// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock } from "@/app/store/global";
import { META, PRIMARY_BTN, SECTION_TITLE } from "../recoder/recoder-styles";
import { RecoderLaunchViewModel } from "./recoder-launch-model";

function RecoderLaunchView({ model }: ViewComponentProps<RecoderLaunchViewModel>) {
    const openHub = () => {
        const meta: Record<string, unknown> = { view: "recoder" };
        if (model.prefillTask != "") {
            meta["recoder:prefilltask"] = model.prefillTask;
        }
        if (model.prefillRepo != "") {
            meta["recoder:prefillrepo"] = model.prefillRepo;
        }
        createBlock({ meta: meta as MetaType });
    };

    return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <div className={SECTION_TITLE}>Launch moved into Workspaces.</div>
            <div className={`${META} max-w-sm`}>
                Create and run agents from the Workspaces hub — recent repos, parallel agents, and one-click session.
            </div>
            <button className={`${PRIMARY_BTN} mt-1`} onClick={openHub}>
                Open Workspaces
            </button>
        </div>
    );
}

RecoderLaunchView.displayName = "RecoderLaunchView";

export { RecoderLaunchView };
