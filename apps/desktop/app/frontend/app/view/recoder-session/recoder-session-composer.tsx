// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtom } from "jotai";
import { RecoderSessionViewModel } from "./recoder-session-model";

/** The composer (apps/web's `src/components/chat` input, ported — plain text, no attachments/slash-commands yet). */
function RecoderSessionComposer({ model }: { model: RecoderSessionViewModel }) {
    const [text, setText] = useAtom(model.composerTextAtom);

    function submit() {
        void model.sendComposerMessage();
    }

    return (
        <div className="flex shrink-0 items-end gap-2 border-t border-border p-2">
            <textarea
                className="min-h-[2.5rem] flex-1 resize-none rounded border border-border bg-transparent px-2 py-1 text-sm outline-none"
                placeholder="Message the agent…"
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key == "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        submit();
                    }
                }}
            />
            <button
                className="shrink-0 rounded border border-border px-3 py-1.5 text-sm hover:bg-white/5 disabled:opacity-40"
                disabled={text.trim() == ""}
                onClick={submit}
            >
                Send
            </button>
        </div>
    );
}

export { RecoderSessionComposer };
