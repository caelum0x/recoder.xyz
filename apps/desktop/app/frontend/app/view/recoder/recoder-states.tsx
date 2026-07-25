// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ERROR_ROW, SKELETON_ROW } from "./recoder-styles";

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

export { RecoderErrorRow, RecoderSkeleton };
