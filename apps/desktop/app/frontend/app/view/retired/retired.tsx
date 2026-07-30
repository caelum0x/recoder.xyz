// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { uxCloseBlock } from "@/app/store/keymodel";
import { atom, type Atom } from "jotai";

// Tombstone for view types that were removed from the product. Saved layouts may
// still contain blocks pointing at a retired view; registering this model keeps
// those layouts loading with a neutral placeholder instead of the raw view key
// (blockViewToName falls back to the key string, which can leak internal names).
class RetiredViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "retired";
        this.viewIcon = atom("square");
        this.viewName = atom("Retired");
    }

    get viewComponent(): ViewComponent {
        return RetiredView;
    }
}

function RetiredView({ model }: ViewComponentProps<RetiredViewModel>) {
    // Opt-in cleanup: a saved layout can still carry a retired block (e.g. an old
    // "openfang"/"pal" tab). Let the user remove it themselves via the same close
    // path as the block header — never mutate their layout automatically.
    return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-3">
            <span className="text-secondary text-sm">This view is no longer available.</span>
            <button
                className="border border-white/8 text-secondary rounded px-2 py-0.5 text-xs hover:bg-border/40 hover:text-primary recoder-transition cursor-pointer"
                onClick={() => uxCloseBlock(model.blockId)}
            >
                Close this view
            </button>
        </div>
    );
}

RetiredView.displayName = "RetiredView";

export { RetiredViewModel };
