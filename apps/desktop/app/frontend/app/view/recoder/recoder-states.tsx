// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";
import { ERROR_ROW, META, SKELETON_ROW } from "./recoder-styles";

function RecoderSkeleton({ rows = 3 }: { rows?: number }) {
    return (
        <div className="flex flex-col gap-1">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className={SKELETON_ROW} />
            ))}
        </div>
    );
}

RecoderSkeleton.displayName = "RecoderSkeleton";

function RecoderErrorRow({ message }: { message: string }) {
    if (message == "") {
        return null;
    }
    return <div className={ERROR_ROW}>{message}</div>;
}

RecoderErrorRow.displayName = "RecoderErrorRow";

function RecoderEmpty({ title, hint }: { title: string; hint?: ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5 py-1">
            <div className="text-secondary text-sm">{title}</div>
            {hint != null && <div className={META}>{hint}</div>}
        </div>
    );
}

RecoderEmpty.displayName = "RecoderEmpty";

export { RecoderEmpty, RecoderErrorRow, RecoderSkeleton };
