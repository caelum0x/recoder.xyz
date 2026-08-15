// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createContext, useContext, type ReactNode } from "react";
import type { RecoderDetailFace } from "./recoder-detail-header";

type RecoderDetailNavigation = (target: RecoderDetailFace, workspaceId: string) => void;

const RecoderDetailNavigationContext = createContext<RecoderDetailNavigation | null>(null);

function RecoderDetailNavigationProvider({
    navigate,
    children,
}: {
    navigate: RecoderDetailNavigation;
    children: ReactNode;
}) {
    return (
        <RecoderDetailNavigationContext.Provider value={navigate}>{children}</RecoderDetailNavigationContext.Provider>
    );
}

function useRecoderDetailNavigation(): RecoderDetailNavigation | null {
    return useContext(RecoderDetailNavigationContext);
}

export { RecoderDetailNavigationProvider, useRecoderDetailNavigation, type RecoderDetailNavigation };
