// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { avatarMenuEntries, identityInitials } from "./recoder-identity-avatar";
import { RecoderIdentityModel } from "./recoder-identity-model";

// Quiet, optional sign-in affordance for the Workspaces hub header. Never a wall:
// signed-out is fine, offline is fine, local agents run without an account.
// `onOpenSettings` wires the avatar-menu Settings entry (PW3 #10) to the hub's
// openView; absent ⇒ the Settings entry is omitted rather than a dead click.
function RecoderIdentityAffordance({ onOpenSettings }: { onOpenSettings?: () => void }) {
    const model = RecoderIdentityModel.getInstance();
    const identity = useAtomValue(model.identityAtom);
    const signingIn = useAtomValue(model.signingInAtom);
    const error = useAtomValue(model.signInErrorAtom);
    const prompt = useAtomValue(model.promptAtom);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        model.refresh();
    }, [model]);

    if (identity != null) {
        const label = identity.name || identity.email || "Signed in";
        // The device flow already carries name/email/plan (recoder-4st1); surface
        // all of it inside the menu without cluttering the quiet trigger.
        const detail = [identity.name, identity.email, identity.plan ? `plan: ${identity.plan}` : null]
            .filter(Boolean)
            .join(" · ");
        return (
            // Sign out lives in the username's small menu (recoder-hr4f), not as
            // bare top-level header chrome. Focus leaving the container closes it.
            <div
                className="relative"
                onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setMenuOpen(false);
                    }
                }}
            >
                <button
                    className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-white/[0.06] recoder-transition cursor-pointer"
                    title={detail || label}
                    onClick={() => setMenuOpen(!menuOpen)}
                >
                    {identity.avatarUrl ? (
                        <img src={identity.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                        // Monogram fallback so a signed-in user always has an avatar,
                        // even before Better Auth populates an image. Graphite, no color.
                        <span
                            className="flex items-center justify-center w-5 h-5 rounded-full bg-white/10 text-primary/90 text-[10px] font-medium select-none"
                            aria-hidden="true"
                        >
                            {identityInitials(identity.name, identity.email)}
                        </span>
                    )}
                    <span className="text-sm text-secondary truncate max-w-[12rem]">{label}</span>
                </button>
                {menuOpen && (
                    <div className="absolute right-0 top-full z-20 mt-1 flex min-w-[12rem] flex-col gap-1 rounded border border-white/10 bg-modalbg p-2 shadow-lg">
                        <span className="text-xs text-secondary truncate" title={detail || label}>
                            {detail || label}
                        </span>
                        {avatarMenuEntries().map((entry) => {
                            if (entry.id == "settings" && onOpenSettings == null) {
                                return null;
                            }
                            return (
                                <button
                                    key={entry.id}
                                    className="rounded px-1 py-0.5 text-left text-sm text-secondary hover:bg-white/[0.06] hover:text-primary recoder-transition cursor-pointer"
                                    onClick={() => {
                                        setMenuOpen(false);
                                        if (entry.id == "settings") {
                                            onOpenSettings?.();
                                            return;
                                        }
                                        model.signOut();
                                    }}
                                >
                                    {entry.label}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    if (signingIn) {
        return (
            <span className="text-xs text-secondary" title={prompt?.verificationUri}>
                {prompt?.userCode ? `Continue in your browser — code ${prompt.userCode}` : "Opening browser to sign in…"}
            </span>
        );
    }

    return (
        <div className="flex items-center gap-2">
            {error != "" && (
                <span className="text-xs text-error" title={error}>
                    Sign-in failed
                </span>
            )}
            <button
                className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer"
                onClick={() => model.signIn()}
                title="Optional — sign in with Google or GitHub to sync memory and PRs. Local agents run without it."
            >
                Sign in with Recoder
            </button>
        </div>
    );
}

RecoderIdentityAffordance.displayName = "RecoderIdentityAffordance";

export { RecoderIdentityAffordance };
