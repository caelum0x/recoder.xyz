// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/app/store/global";
import { useEffect, useState } from "react";
import { CHANGELOG_ENTRIES, CHANGELOG_URL } from "./recoder-changelog";
import { selectWhatsNew, type WhatsNewEntry } from "./recoder-whats-new";

const SEEN_KEY = "recoder:whats-new-seen";

function readSeen(): string {
    try {
        return localStorage.getItem(SEEN_KEY) ?? "";
    } catch {
        return "";
    }
}

function currentVersion(): string {
    try {
        return getApi().getAboutModalDetails().version ?? "";
    } catch {
        return "";
    }
}

// The post-update "what's new" card. Shows the named features shipped since the
// version the user last acknowledged, then persists the current version on
// dismiss so it never nags twice for the same release. Renders nothing on a
// fresh install or when already caught up (see selectWhatsNew).
function RecoderWhatsNew() {
    const [entries, setEntries] = useState<WhatsNewEntry[]>([]);
    const [version, setVersion] = useState("");

    useEffect(() => {
        const current = currentVersion();
        setVersion(current);
        setEntries(selectWhatsNew(CHANGELOG_ENTRIES, readSeen(), current));
    }, []);

    if (entries.length == 0) {
        return null;
    }

    const dismiss = () => {
        try {
            localStorage.setItem(SEEN_KEY, version);
        } catch {
            // a corrupt store must never break the dismiss
        }
        setEntries([]);
    };

    return (
        <div className="flex flex-col gap-2 rounded border border-white/8 p-3 recoder-enter">
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium tracking-tight text-primary">
                    What's new{version != "" ? ` in ${version}` : ""}
                </span>
                <div className="flex-1" />
                <button
                    className="text-xs text-secondary hover:text-primary underline underline-offset-2 cursor-pointer"
                    onClick={() => {
                        try {
                            getApi().openExternal(CHANGELOG_URL);
                        } catch {
                            // no external opener wired — the button just no-ops
                        }
                    }}
                >
                    Full changelog
                </button>
                <button
                    className="border border-white/8 text-secondary rounded px-2 py-0.5 text-xs hover:bg-border/40 hover:text-primary recoder-transition cursor-pointer"
                    onClick={dismiss}
                >
                    Got it
                </button>
            </div>
            {entries.map((entry) => (
                <div key={entry.version} className="flex flex-col gap-0.5">
                    <span className="text-xs uppercase tracking-wide text-secondary">
                        {entry.version} — {entry.title}
                    </span>
                    {entry.notes.map((note, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-primary/90">
                            <span className="inline-block w-1 h-1 mt-1.5 rounded-full bg-accent/70 shrink-0" />
                            <span>{note}</span>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

RecoderWhatsNew.displayName = "RecoderWhatsNew";

export { RecoderWhatsNew };
