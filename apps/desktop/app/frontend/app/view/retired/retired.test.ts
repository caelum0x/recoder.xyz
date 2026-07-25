// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { RetiredViewModel } from "./retired";

function makeModel(): RetiredViewModel {
    return new RetiredViewModel({ blockId: "b1" } as ViewModelInitType);
}

describe("RetiredViewModel", () => {
    it("shows a neutral name with no engine identifiers", () => {
        const model = makeModel();
        const store = createStore();
        const name = store.get(model.viewName);
        expect(name).toBe("Retired");
        expect(name.toLowerCase()).not.toContain("openfang");
    });

    it("renders the tombstone component", () => {
        const model = makeModel();
        expect(model.viewComponent).toBeTypeOf("function");
        expect(model.viewType).toBe("retired");
    });
});
