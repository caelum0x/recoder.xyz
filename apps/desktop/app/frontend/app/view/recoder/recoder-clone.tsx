// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/app/store/global";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { deriveGitHubUrl, isGitHubRepoUrl } from "./recoder-clone-logic";
import { githubIdentityLabel } from "./recoder-github-logic";
import { type RecoderViewModel } from "./recoder-model";
import { CHIP, ERROR_ROW, FIELD_LABEL, INPUT, META, PRIMARY_BTN, QUIET_BTN, SECTION_TITLE } from "./recoder-styles";

type RecoderCloneModalProps = { model: RecoderViewModel; onClose: () => void };

function RecoderCloneModal({ model, onClose }: RecoderCloneModalProps) {
    const [url, setUrl] = useAtom(model.cloneUrlAtom);
    const [destDir, setDestDir] = useAtom(model.cloneDestDirAtom);
    const cloning = useAtomValue(model.cloningAtom);
    const cloneError = useAtomValue(model.cloneErrorAtom);
    const recentRepos = useAtomValue(model.recentReposAtom);
    const githubStatus = useAtomValue(model.githubStatusAtom);
    const githubRepos = useAtomValue(model.githubReposAtom);
    const paletteOpen = useAtomValue(model.commandPaletteOpenAtom);
    const shortcutsOpen = useAtomValue(model.shortcutsOpenAtom);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Escape composes with the palette/shortcuts overlays: when one of them is
    // stacked above this modal, its OWN capture handler closes it and this one
    // stands down, so a single Escape never tears down the whole stack.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key != "Escape" || paletteOpen || shortcutsOpen) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            onClose();
        };
        document.addEventListener("keydown", handler, true);
        return () => document.removeEventListener("keydown", handler, true);
    }, [onClose, paletteOpen, shortcutsOpen]);

    const urlValid = isGitHubRepoUrl(url.trim());
    const canClone = !cloning && urlValid;
    // Recent repos are stored as LOCAL folder paths; a GitHub URL is only shown
    // when an entry is itself obviously a GitHub URL — we never guess a remote
    // from a folder name, so this list is usually empty and the URL input leads.
    const recentUrls = [...new Set(recentRepos.map(deriveGitHubUrl).filter((u) => u != ""))];
    const githubIdentity = githubIdentityLabel(githubStatus);

    const browseLocation = async () => {
        try {
            const picked = await getApi().selectDirectory();
            if (picked != null && picked != "") {
                setDestDir(picked);
            }
        } catch {
            // degrade-safe: no native picker in this context — the field still works
        }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key == "Enter" && canClone) {
            e.preventDefault();
            model.cloneRepo(url, destDir);
        }
    };

    return (
        <div className="fixed inset-0 z-[var(--zindex-typeahead-modal)]">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div
                className="absolute left-1/2 top-[15%] -translate-x-1/2 flex w-[460px] max-w-[90vw] flex-col gap-3 bg-modalbg border border-white/8 rounded-md shadow-lg p-3 recoder-enter"
                onKeyDown={onKeyDown}
            >
                <div className={SECTION_TITLE}>Open GitHub project</div>
                {githubIdentity != "" && <span className={META}>Detected GitHub account: {githubIdentity}</span>}

                <label className="flex flex-col gap-1">
                    <span className={FIELD_LABEL}>Repository URL</span>
                    <input
                        ref={inputRef}
                        className={`${INPUT} font-mono`}
                        placeholder="https://github.com/owner/repo"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                    />
                    {url.trim() != "" && !urlValid && (
                        <span className={META}>
                            Use https://github.com/owner/repo or git@github.com:owner/repo.git
                        </span>
                    )}
                </label>

                {githubRepos.length > 0 && (
                    <div className="flex flex-col gap-1">
                        <span className={FIELD_LABEL}>Your GitHub repos</span>
                        <div className="flex flex-wrap gap-1.5">
                            {githubRepos.slice(0, 12).map((r) => (
                                <button
                                    key={r.nameWithOwner}
                                    className={CHIP}
                                    title={r.url}
                                    onClick={() => setUrl(r.url)}
                                >
                                    {r.nameWithOwner}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {recentUrls.length > 0 && (
                    <div className="flex flex-col gap-1">
                        <span className={FIELD_LABEL}>Recent repos</span>
                        <div className="flex flex-wrap gap-1.5">
                            {recentUrls.map((u) => (
                                <button key={u} className={CHIP} title={u} onClick={() => setUrl(u)}>
                                    {u.replace("https://github.com/", "")}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <label className="flex flex-col gap-1">
                    <span className={FIELD_LABEL}>Location</span>
                    <div className="flex items-center gap-2">
                        <input
                            className={`${INPUT} min-w-0 flex-1 font-mono`}
                            placeholder="Default: ~/recoder/repos"
                            value={destDir}
                            onChange={(e) => setDestDir(e.target.value)}
                        />
                        <button className={QUIET_BTN} onClick={browseLocation}>
                            Browse
                        </button>
                    </div>
                    <span className={META}>The repo is cloned into a folder named after it here.</span>
                </label>

                {cloneError != "" && <div className={ERROR_ROW}>{cloneError}</div>}

                <div className="flex items-center gap-2">
                    <button
                        className={PRIMARY_BTN}
                        disabled={!canClone}
                        onClick={() => model.cloneRepo(url, destDir)}
                    >
                        {cloning ? "Cloning…" : "Clone repo"}
                        <span className="ml-1.5 text-xs text-meta font-mono">⌘↵</span>
                    </button>
                    <button className={QUIET_BTN} onClick={onClose}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

RecoderCloneModal.displayName = "RecoderCloneModal";

export { RecoderCloneModal };
