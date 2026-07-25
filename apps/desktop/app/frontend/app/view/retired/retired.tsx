// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

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

function RetiredView({}: ViewComponentProps<RetiredViewModel>) {
    return (
        <div className="flex h-full items-center justify-center p-3">
            <span className="text-secondary text-sm">This view is no longer available.</span>
        </div>
    );
}

RetiredView.displayName = "RetiredView";

export { RetiredViewModel };
