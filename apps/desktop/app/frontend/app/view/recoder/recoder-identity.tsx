// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { identityInitials } from "./recoder-identity-avatar";
import { RecoderIdentityModel } from "./recoder-identity-model";

// Quiet, optional sign-in affordance for the Workspaces hub header. Never a wall:
// signed-out is fine, offline is fine, local agents run without an account.
function RecoderIdentityAffordance() {
    const model = RecoderIdentityModel.getInstance();
    const identity = useAtomValue(model.identityAtom);
    const signingIn = useAtomValue(model.signingInAtom);
    const error = useAtomValue(model.signInErrorAtom);
    const prompt = useAtomValue(model.promptAtom);

    useEffect(() => {
        model.refresh();
    }, [model]);

    if (identity != null) {
        const label = identity.name || identity.email || "Signed in";
        // The device flow already carries name/email/plan (recoder-4st1); surface
        // all of it on hover without cluttering the quiet affordance.
        const detail = [identity.name, identity.email, identity.plan ? `plan: ${identity.plan}` : null]
            .filter(Boolean)
            .join(" · ");
        return (
            <div className="flex items-center gap-2">
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
                <span className="text-sm text-secondary truncate max-w-[12rem]" title={detail || label}>
                    {label}
                </span>
                <button
                    className="text-xs text-secondary hover:text-primary underline underline-offset-2 cursor-pointer"
                    onClick={() => model.signOut()}
                >
                    Sign out
                </button>
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
