// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtomValue } from "jotai";
import { RecoderSessionViewModel } from "./recoder-session-model";

const ROLE_LABEL: Record<string, string> = {
    user: "You",
    assistant: "Agent",
    system: "System",
};

/** The message stream (apps/web's chat transcript, ported — text only; tool-call/diff detail lives in the Review panel). */
function RecoderSessionMessages({ model }: { model: RecoderSessionViewModel }) {
    const messages = useAtomValue(model.messagesAtom);

    if (messages.length == 0) {
        return <div className="flex-1 overflow-auto px-3 py-2 text-xs text-secondary">No messages yet. Say something below.</div>;
    }

    return (
        <div className="flex-1 overflow-auto px-3 py-2 flex flex-col gap-2">
            {messages.map((message) => (
                <div key={message.id} className="flex flex-col gap-0.5">
                    <span className="text-xs text-secondary">
                        {ROLE_LABEL[message.role] ?? message.role}
                        {message.streaming && " · streaming…"}
                    </span>
                    <span className="whitespace-pre-wrap text-sm">{message.text}</span>
                </div>
            ))}
        </div>
    );
}

export { RecoderSessionMessages };
