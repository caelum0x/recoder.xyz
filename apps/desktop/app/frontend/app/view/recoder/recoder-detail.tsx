// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderDiffView } from "@/app/view/recoder-diff/recoder-diff";
import { useAtomValue } from "jotai";
import type { RecoderDetailViewModel } from "./recoder-detail-model";
import { RecoderDetailNavigationProvider } from "./recoder-detail-navigation";
import { RecoderTerminalView } from "./recoder-terminal";

function RecoderDetailView(props: ViewComponentProps<RecoderDetailViewModel>) {
    const { model } = props;
    const activeFace = useAtomValue(model.activeFaceAtom);
    useAtomValue(model.childVersionAtom);
    const childProps = {
        blockId: props.blockId,
        blockRef: props.blockRef,
        contentRef: props.contentRef,
    };

    return (
        <RecoderDetailNavigationProvider navigate={(target, workspaceId) => model.navigate(target, workspaceId)}>
            {activeFace == "session" ? (
                <RecoderTerminalView {...childProps} model={model.session()} />
            ) : (
                <RecoderDiffView {...childProps} model={model.review()} />
            )}
        </RecoderDetailNavigationProvider>
    );
}

RecoderDetailView.displayName = "RecoderDetailView";

export { RecoderDetailView };
