// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock, getApi } from "@/app/store/global";
import type { RecoderApproval } from "@/app/view/recoder-approvals/recoder-approvals-model";
import { agentLabel } from "@/app/view/recoder/recoder-agent-labels";
import { RecoderDetailHeader, workspaceOptionLabel } from "@/app/view/recoder/recoder-detail-header";
import { openWorkspaceTerminal } from "@/app/view/recoder/recoder-open-terminal";
import { prChipLabel, prChipTone, prCreateGate, type RecoderPrChip } from "@/app/view/recoder/recoder-pr-status";
import { RecoderEmpty, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { PRIMARY_BTN, QUIET_BTN } from "@/app/view/recoder/recoder-styles";
import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { computeDiffLineAnchors, type DiffLineAnchor } from "./recoder-diff-comments";
import {
    computeDiffHunkAnchors,
    deriveFileJumpList,
    fileSectionLabel,
    parseDiffFileSections,
    type DiffFileJumpItem,
    type DiffFileSection,
    type DiffHunkAnchor,
} from "./recoder-diff-files";
import { reviewDetailsDefaultOpen, reviewPrimaryAction } from "./recoder-diff-layout";
import { nextFileIndex, PRIMARY_CHORD_HINT, reviewKeyAction } from "./recoder-diff-review-keys";
import {
    isFailedConclusion,
    RecoderDiffViewModel,
    suggestReviewAction,
    type RecoderCheckRow,
    type RecoderWorkspaceChecks,
} from "./recoder-diff-model";
import { EvidencePanel } from "./recoder-evidence-panel";

const REFRESH_MS = 6000;

type DiffLineKind = "add" | "del" | "hunk" | "meta" | "ctx";

// Classify a unified-diff line by change type. File headers ("+++"/"---"/"diff "
// /"index ") are matched before the generic +/- so they read as neutral metadata.
function diffLineKind(line: string): DiffLineKind {
    if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("+++") || line.startsWith("---")) {
        return "meta";
    }
    if (line.startsWith("@@")) {
        return "hunk";
    }
    if (line.startsWith("+")) {
        return "add";
    }
    if (line.startsWith("-")) {
        return "del";
    }
    return "ctx";
}

// Change type is encoded WITHOUT color: a luminance step (bg), an always-visible
// gutter glyph, and a left-border bar. Crimson appears ONLY as the thin del
// left-border marker, never on line text; green is never used.
const AddGutter = "+";
const DelGutter = "-";
const NeutralGutter = " ";

const AddRow = "bg-white/[0.05] text-primary/90 border-l-2 border-white/25";
const DelRow = "bg-black/25 text-primary/50 border-l-2 border-error/50";
const HunkRow = "text-accent";
const MetaRow = "text-secondary";
const CtxRow = "text-primary/70";

function diffRowClass(kind: DiffLineKind): string {
    if (kind == "add") {
        return AddRow;
    }
    if (kind == "del") {
        return DelRow;
    }
    if (kind == "hunk") {
        return HunkRow;
    }
    if (kind == "meta") {
        return MetaRow;
    }
    return CtxRow;
}

function diffGutter(kind: DiffLineKind): string {
    if (kind == "add") {
        return AddGutter;
    }
    if (kind == "del") {
        return DelGutter;
    }
    return NeutralGutter;
}

// The inline composer that opens under a clicked diff line. Kept tiny and quiet;
// Enter (without Shift) submits, Escape cancels — the terminal-native reflexes.
function InlineCommentComposer({
    anchorLabel,
    onSubmit,
    onCancel,
}: {
    anchorLabel: string;
    onSubmit: (body: string) => void;
    onCancel: () => void;
}) {
    const [body, setBody] = useState("");
    const submit = () => {
        if (body.trim() != "") {
            onSubmit(body);
        }
    };
    return (
        <div className="flex flex-col gap-1 border-l-2 border-accent/50 bg-white/[0.03] px-2 py-1.5 my-0.5">
            <span className="text-[10px] uppercase tracking-wide text-secondary/70">comment on {anchorLabel}</span>
            <textarea
                autoFocus
                className="w-full resize-y rounded border border-border bg-transparent px-1.5 py-1 text-xs font-sans focus:outline-none focus:border-accent/60"
                rows={2}
                value={body}
                placeholder="What should the agent change here?"
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key == "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submit();
                    } else if (e.key == "Escape") {
                        e.preventDefault();
                        onCancel();
                    }
                }}
            />
            <div className="flex items-center gap-2">
                <button className={PRIMARY_BTN} disabled={body.trim() == ""} onClick={submit}>
                    Add comment
                </button>
                <button className={QUIET_BTN} onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

// One rendered diff line. Keyed by its GLOBAL index into patch.split("\n") so the
// anchor lookup and the open-composer state survive per-file grouping unchanged —
// the composer's file:line context is exactly what it was in the flat render.
function DiffLineRow({
    line,
    globalIndex,
    anchor,
    activeLine,
    setActiveLine,
    model,
}: {
    line: string;
    globalIndex: number;
    anchor: DiffLineAnchor;
    activeLine: number;
    setActiveLine: (i: number) => void;
    model: RecoderDiffViewModel;
}) {
    const kind = diffLineKind(line);
    const commentable = anchor != null && anchor.file != "" && anchor.line != null;
    const anchorLabel = commentable ? `${anchor.file}:${anchor.line}${anchor.side == "old" ? " (old)" : ""}` : "";
    return (
        <div className="group">
            <div className={cn("flex min-h-[1.25rem]", diffRowClass(kind))}>
                <span className="select-none w-4 text-center opacity-70 font-mono">{diffGutter(kind)}</span>
                <span className="flex-1 whitespace-pre">{line == "" ? " " : line}</span>
                {commentable && (
                    <button
                        className="select-none opacity-0 group-hover:opacity-100 text-secondary/70 hover:text-accent transition-opacity px-1 text-[11px] cursor-pointer"
                        title={`Comment on ${anchorLabel}`}
                        onClick={() => setActiveLine(activeLine == globalIndex ? -1 : globalIndex)}
                    >
                        <i className="fa-solid fa-comment" />
                    </button>
                )}
            </div>
            {activeLine == globalIndex && commentable && (
                <InlineCommentComposer
                    anchorLabel={anchorLabel}
                    onSubmit={(bodyText) => {
                        model.addComment(anchor.file, anchor.line, bodyText, anchor.side ?? undefined);
                        setActiveLine(-1);
                    }}
                    onCancel={() => setActiveLine(-1)}
                />
            )}
        </div>
    );
}

// The jump list above the diff: one row per file (path · +adds/-dels) that scrolls
// to — and expands — its section, with the keyboard cursor's current file clearly
// marked (one accent, a left bar). j/k or the arrows move the cursor; a click jumps
// too. Only shown for multi-file diffs.
function DiffFileList({ items, onJump }: { items: DiffFileJumpItem[]; onJump: (i: number) => void }) {
    return (
        <div className="flex flex-col gap-0.5 rounded border border-border p-2 bg-panel">
            <div className="text-xs uppercase tracking-wide text-secondary">{items.length} files · j / k to jump</div>
            {items.map((item) => (
                <button
                    key={item.sectionIndex}
                    className={cn(
                        "flex items-center gap-2 rounded px-1 text-left text-xs font-mono border-l-2 recoder-transition cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-white/50",
                        item.current
                            ? "border-accent bg-white/[0.06] text-primary"
                            : "border-transparent text-secondary hover:text-primary"
                    )}
                    aria-current={item.current ? "true" : undefined}
                    title={`Jump to ${item.label}`}
                    onClick={() => onJump(item.sectionIndex)}
                >
                    <span className="flex-1 truncate">{item.label}</span>
                    <span className="text-primary/70 shrink-0">+{item.adds}</span>
                    <span className="text-error/70 shrink-0">-{item.dels}</span>
                </button>
            ))}
        </div>
    );
}

// The quiet reveal-on-hover discard trigger shared by file headers and hunk
// headers. Destructive intent shows only on hover-to-error, never as a loud
// standing button.
const DISCARD_TRIGGER =
    "select-none opacity-0 group-hover:opacity-100 focus:opacity-100 text-secondary/70 hover:text-error transition-opacity px-1 text-[11px] cursor-pointer shrink-0 disabled:opacity-50";

// Inline destructive confirm — never a browser confirm(). Bordered in the del
// marker's crimson so the destructive step reads as such without color-flooding.
function DiscardConfirm({
    label,
    busy,
    onConfirm,
    onCancel,
}: {
    label: string;
    busy: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <div className="flex items-center gap-2 flex-wrap border-l-2 border-error/50 bg-white/[0.03] px-2 py-1 my-0.5 text-xs font-sans">
            <span className="text-secondary">{label}</span>
            <button
                className={cn(QUIET_BTN, "border-error/50 text-error hover:bg-error/10")}
                disabled={busy}
                onClick={onConfirm}
            >
                {busy ? "Discarding…" : "Discard"}
            </button>
            <button className={QUIET_BTN} disabled={busy} onClick={onCancel}>
                Cancel
            </button>
        </div>
    );
}

// The collapsible per-file header inside the diff. Sticky so the filename stays
// visible while scrolling its hunks; the caret encodes collapsed/expanded. Also
// hosts the per-FILE reject: one governed discard call, confirmed inline.
function DiffFileHeader({
    section,
    collapsed,
    onToggle,
    armed,
    discarding,
    onArmDiscard,
    onCancelDiscard,
    onConfirmDiscard,
}: {
    section: DiffFileSection;
    collapsed: boolean;
    onToggle: () => void;
    armed: boolean;
    discarding: boolean;
    onArmDiscard: () => void;
    onCancelDiscard: () => void;
    onConfirmDiscard: () => void;
}) {
    return (
        <div className="sticky top-0 bg-panel z-10 group">
            <div className="flex w-full items-center gap-2 py-0.5 text-xs font-mono">
                <button
                    className="flex flex-1 min-w-0 items-center gap-2 text-left text-secondary hover:text-primary transition-colors cursor-pointer"
                    onClick={onToggle}
                >
                    <span className="select-none w-3 text-center opacity-70">{collapsed ? "▸" : "▾"}</span>
                    <span className="flex-1 truncate text-primary/80">{fileSectionLabel(section)}</span>
                    <span className="text-primary/70 shrink-0">+{section.adds}</span>
                    <span className="text-error/70 shrink-0">-{section.dels}</span>
                </button>
                {section.path != "" && !section.renamed && (
                    <button
                        className={DISCARD_TRIGGER}
                        title={`Discard all changes to ${section.path}`}
                        disabled={discarding}
                        onClick={() => (armed ? onCancelDiscard() : onArmDiscard())}
                    >
                        Discard
                    </button>
                )}
                {section.renamed && (
                    <span
                        className="shrink-0 text-xs text-secondary opacity-60 select-none"
                        title="Renamed files can't be discarded from here — a single-path revert would delete the file instead of restoring it. Use the terminal (git) for rename rollbacks."
                    >
                        renamed
                    </span>
                )}
            </div>
            {armed && (
                <DiscardConfirm
                    label={`Discard all changes to ${section.path}? This restores it to the review base.`}
                    busy={discarding}
                    onConfirm={onConfirmDiscard}
                    onCancel={onCancelDiscard}
                />
            )}
        </div>
    );
}

// The `@@` hunk-header row with the per-HUNK reject: the same quiet affordance
// wired to the governed discard-hunks edge, confirmed inline.
function DiffHunkHeaderRow({
    line,
    anchor,
    armed,
    discarding,
    onArmDiscard,
    onCancelDiscard,
    onConfirmDiscard,
}: {
    line: string;
    anchor: DiffHunkAnchor;
    armed: boolean;
    discarding: boolean;
    onArmDiscard: () => void;
    onCancelDiscard: () => void;
    onConfirmDiscard: () => void;
}) {
    return (
        <div className="group">
            <div className={cn("flex min-h-[1.25rem]", HunkRow)}>
                <span className="select-none w-4 text-center opacity-70 font-mono">{NeutralGutter}</span>
                <span className="flex-1 whitespace-pre">{line}</span>
                <button
                    className={DISCARD_TRIGGER}
                    title={`Discard hunk ${anchor.hunkIndex + 1} of ${anchor.path}`}
                    disabled={discarding}
                    onClick={() => (armed ? onCancelDiscard() : onArmDiscard())}
                >
                    Discard hunk
                </button>
            </div>
            {armed && (
                <DiscardConfirm
                    label={`Discard hunk ${anchor.hunkIndex + 1} of ${anchor.path}? This reverts just this hunk to the review base.`}
                    busy={discarding}
                    onConfirm={onConfirmDiscard}
                    onCancel={onCancelDiscard}
                />
            )}
        </div>
    );
}

function DiffBody({
    patch,
    model,
    onPrimary,
    primaryAvailable,
}: {
    patch: string;
    model: RecoderDiffViewModel;
    onPrimary: () => void;
    primaryAvailable: boolean;
}) {
    const lines = patch.split("\n");
    const anchors = computeDiffLineAnchors(patch);
    const sections = parseDiffFileSections(patch);
    const hunkAnchors = computeDiffHunkAnchors(patch);
    const discarding = useAtomValue(model.discardingAtom);
    // Which rendered line has its comment composer open (-1 = none). Local UI
    // state: the enqueued comments themselves live on the model.
    const [activeLine, setActiveLine] = useState(-1);
    // The keyboard file-jump cursor: which section j/k/arrows land on. Clamped to
    // the section count so a shrunk diff never leaves it pointing past the end.
    const [currentFile, setCurrentFile] = useState(0);
    // Which discard confirm is armed (-1 = none): a section index for a file
    // discard, a global line index for a hunk discard. Arming one disarms the
    // other — exactly one destructive confirm can be open. Pure UI state; the
    // worktree truth stays server-side.
    const [armedFileDiscard, setArmedFileDiscard] = useState(-1);
    const [armedHunkDiscard, setArmedHunkDiscard] = useState(-1);
    // Per-section collapsed flags (default expanded). Keyed by section index.
    const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
    const sectionRefs = useRef<Record<number, HTMLDivElement>>({});

    const setCollapsedFor = (i: number, value: boolean) => setCollapsed((prev) => ({ ...prev, [i]: value }));

    const armFileDiscard = (i: number) => {
        setArmedFileDiscard(i);
        setArmedHunkDiscard(-1);
    };
    const armHunkDiscard = (globalIndex: number) => {
        setArmedHunkDiscard(globalIndex);
        setArmedFileDiscard(-1);
    };
    const disarmDiscard = () => {
        setArmedFileDiscard(-1);
        setArmedHunkDiscard(-1);
    };
    const confirmFileDiscard = (section: DiffFileSection) => {
        disarmDiscard();
        model.discardFiles([section.path]);
    };
    const confirmHunkDiscard = (anchor: DiffHunkAnchor) => {
        disarmDiscard();
        model.discardHunks(anchor.path, [anchor.hunkIndex]);
    };

    const jumpTo = (i: number) => {
        const clamped = nextFileIndex(i, sections.length, 0);
        setCurrentFile(clamped);
        setCollapsedFor(clamped, false);
        // Expand first, then scroll on the next frame so the section is mounted.
        requestAnimationFrame(() => sectionRefs.current[clamped]?.scrollIntoView({ block: "start" }));
    };

    // The Review keyboard grammar: the primary action's mod+Enter chord and the
    // j/k/arrow file-jump cursor, gated so a keystroke aimed at the comment composer
    // is never stolen (reviewKeyAction's typing-guard). Every branch maps to a REAL
    // action — a blocked primary yields no key effect (primaryAvailable false).
    const onDiffKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const tag = target?.tagName;
        const typing =
            tag == "INPUT" || tag == "TEXTAREA" || tag == "SELECT" || target?.isContentEditable == true;
        const intent = reviewKeyAction(
            {
                key: e.key,
                metaKey: e.metaKey,
                ctrlKey: e.ctrlKey,
                altKey: e.altKey,
                shiftKey: e.shiftKey,
                typing,
            },
            primaryAvailable
        );
        if (intent == null) {
            return;
        }
        e.preventDefault();
        if (intent == "primary") {
            onPrimary();
            return;
        }
        jumpTo(nextFileIndex(currentFile, sections.length, intent == "file-next" ? 1 : -1));
    };

    const jumpItems = deriveFileJumpList(sections, currentFile);

    return (
        <div
            className="flex flex-col gap-2 min-h-0 overflow-hidden focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-white/40 recoder-transition"
            tabIndex={0}
            role="group"
            aria-label="Review diff — j / k to jump files, ⌘⏎ for the primary action"
            onKeyDown={onDiffKeyDown}
        >
            {sections.length > 1 && <DiffFileList items={jumpItems} onJump={jumpTo} />}
            <div className="text-xs leading-5 font-mono overflow-auto rounded border border-border p-2 bg-panel">
                {sections.map((section, si) => {
                    const isCollapsed = collapsed[si] ?? false;
                    return (
                        <div
                            key={si}
                            ref={(el) => {
                                if (el != null) {
                                    sectionRefs.current[si] = el;
                                }
                            }}
                            className="flex flex-col"
                        >
                            <DiffFileHeader
                                section={section}
                                collapsed={isCollapsed}
                                onToggle={() => setCollapsedFor(si, !isCollapsed)}
                                armed={armedFileDiscard == si}
                                discarding={discarding}
                                onArmDiscard={() => armFileDiscard(si)}
                                onCancelDiscard={disarmDiscard}
                                onConfirmDiscard={() => confirmFileDiscard(section)}
                            />
                            {!isCollapsed &&
                                lines.slice(section.startIndex, section.endIndex).map((line, offset) => {
                                    const globalIndex = section.startIndex + offset;
                                    // Renamed sections get NO hunk affordance — the
                                    // backend's single-path re-diff sees a rename as a
                                    // whole-file add, so a hunk discard would delete
                                    // the file (see DiffFileSection.renamed).
                                    const hunkAnchor = section.renamed ? null : hunkAnchors[globalIndex];
                                    if (hunkAnchor != null) {
                                        return (
                                            <DiffHunkHeaderRow
                                                key={globalIndex}
                                                line={line}
                                                anchor={hunkAnchor}
                                                armed={armedHunkDiscard == globalIndex}
                                                discarding={discarding}
                                                onArmDiscard={() => armHunkDiscard(globalIndex)}
                                                onCancelDiscard={disarmDiscard}
                                                onConfirmDiscard={() => confirmHunkDiscard(hunkAnchor)}
                                            />
                                        );
                                    }
                                    return (
                                        <DiffLineRow
                                            key={globalIndex}
                                            line={line}
                                            globalIndex={globalIndex}
                                            anchor={anchors[globalIndex]}
                                            activeLine={activeLine}
                                            setActiveLine={setActiveLine}
                                            model={model}
                                        />
                                    );
                                })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// The queued review comments + the send-to-agent affordance. Reads the model's
// pending-comment state; sending POSTs the gated /review-comments steer.
function ReviewCommentQueue({ model }: { model: RecoderDiffViewModel }) {
    const pending = useAtomValue(model.pendingCommentsAtom);
    const sending = useAtomValue(model.commentSendingAtom);
    const status = useAtomValue(model.commentStatusAtom);
    if (pending.length == 0) {
        return status != "" ? <div className="text-xs text-secondary">{status}</div> : null;
    }
    return (
        <div className="flex flex-col gap-1 rounded border border-white/8 p-2">
            <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-secondary">
                    {pending.length} review comment{pending.length == 1 ? "" : "s"}
                </span>
                <div className="flex-1" />
                <button className={PRIMARY_BTN} disabled={sending} onClick={() => model.sendComments()}>
                    {sending ? "Sending…" : "Send to agent"}
                </button>
            </div>
            {pending.map((c, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs">
                    <span className="font-mono text-secondary shrink-0">
                        {c.line != null ? `${c.file}:${c.line}${c.side == "old" ? " (old)" : ""}` : c.file}
                    </span>
                    <span className="flex-1 text-primary/90">{c.body}</span>
                    <button
                        className="text-secondary/70 hover:text-error transition-colors cursor-pointer shrink-0"
                        title="Remove"
                        onClick={() => model.removeComment(i)}
                    >
                        <i className="fa-solid fa-xmark" />
                    </button>
                </div>
            ))}
            {status != "" && <div className="text-xs text-secondary">{status}</div>}
        </div>
    );
}

function checkDotClass(row: RecoderCheckRow): string {
    if (isFailedConclusion(row.conclusion)) {
        return "bg-error";
    }
    if (row.status.toLowerCase() != "completed") {
        return "border border-secondary/70";
    }
    return "bg-secondary/70";
}

function checkLabel(value: string): string {
    return value.toLowerCase().replace(/_/g, " ");
}

const REFRESH_LINK = "text-secondary/70 underline hover:text-secondary transition-colors cursor-pointer disabled:opacity-50 disabled:no-underline";

function ChecksStrip({
    checks,
    loading,
    onRefresh,
}: {
    checks: RecoderWorkspaceChecks;
    loading: boolean;
    onRefresh: () => void;
}) {
    // The manual affordance: the 6s poll skips gh, so while a user sits on one
    // workspace watching CI this is how they pull a fresh result on demand.
    const refreshBtn = (
        <button className={REFRESH_LINK} disabled={loading} onClick={onRefresh} title="Re-check CI">
            {loading ? "checking…" : "refresh"}
        </button>
    );
    if (loading && checks == null) {
        return <div className="flex items-center gap-2 text-xs text-secondary/70">{refreshBtn}</div>;
    }
    if (checks == null) {
        return null;
    }
    if (!checks.available) {
        return (
            <div className="flex items-center gap-2 text-xs text-secondary/70">
                <span>checks: {checks.reason || "unavailable"}</span>
                {refreshBtn}
            </div>
        );
    }
    const rows = checks.checks ?? [];
    return (
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-secondary">
            {checks.mergeable != "" && (
                <span className="border border-border rounded px-1">{checkLabel(checks.mergeable)}</span>
            )}
            {checks.reviewDecision != "" && (
                <span className="border border-border rounded px-1">{checkLabel(checks.reviewDecision)}</span>
            )}
            {rows.map((row, i) => (
                <span key={`${row.name}-${i}`} className="flex items-center gap-1" title={checkLabel(row.conclusion || row.status)}>
                    <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", checkDotClass(row))} />
                    <span>{row.name}</span>
                </span>
            ))}
            {rows.length == 0 && <span>no checks reported</span>}
            {refreshBtn}
        </div>
    );
}

// The live PR chip on the Review header — the workspace's pull-request state
// from the same gh-backed pr-status edge the board uses, reusing prChipLabel/
// prChipTone so the two surfaces read identically. Clicking opens the PR.
function ReviewPrChip({ chip }: { chip: RecoderPrChip }) {
    const clickable = chip.url != "";
    return (
        <span
            className={cn(
                "rounded border px-1.5 py-0.5 text-sm whitespace-nowrap",
                prChipTone(chip),
                clickable && "cursor-pointer hover:opacity-80"
            )}
            title={clickable ? chip.url : "Pull-request state via gh"}
            onClick={() => {
                if (!clickable) {
                    return;
                }
                try {
                    getApi().openExternal(chip.url);
                } catch {
                    // no external opener wired — the chip stays a passive badge
                }
            }}
        >
            {prChipLabel(chip)}
        </span>
    );
}

ReviewPrChip.displayName = "ReviewPrChip";

// The inline governance block (DESIGN-REFERENCE 3B): when the selected run is
// blocked awaiting an approval, its ONE pending approval surfaces here in-context
// — the risky action + the real governance reason, with a single approve/reject —
// instead of sending the reviewer to a separate Approvals tab. Approve advances
// the run server-side; a failed decision surfaces its truthful reason and keeps
// the card (never a fabricated "approved").
function InlineApprovalCard({
    approval,
    deciding,
    error,
    onApprove,
    onReject,
}: {
    approval: RecoderApproval;
    deciding: boolean;
    error: string;
    onApprove: () => void;
    onReject: () => void;
}) {
    const action = approval.action || "";
    const reason = approval.reason || "This run is waiting on your approval before it can continue.";
    return (
        <div className="flex flex-col gap-2 rounded border border-accent/40 bg-accent/5 p-3">
            <div className="flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                <span className="text-sm font-medium">Waiting on your approval</span>
                {approval.riskTier && (
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-secondary">{approval.riskTier}</span>
                )}
            </div>
            <div className="text-sm text-primary/90">{reason}</div>
            {action != "" && <div className="text-xs font-mono text-secondary truncate">{action}</div>}
            <div className="flex items-center gap-2">
                <button className={PRIMARY_BTN} disabled={deciding} onClick={onApprove}>
                    {deciding ? "…" : "Approve"}
                </button>
                <button className={QUIET_BTN} disabled={deciding} onClick={onReject}>
                    {deciding ? "…" : "Reject"}
                </button>
            </div>
            {error != "" && <div className="text-xs text-error">{error}</div>}
        </div>
    );
}

InlineApprovalCard.displayName = "InlineApprovalCard";

// Open the OTHER detail face for the SAME workspace as its own block — the exact
// view meta the hub's openSession/openReview use, so the shared header's segments
// navigate the three faces as one detail. Fire-and-forget: a failed cross-block
// open must never crash the Review view.
async function openDetailBlock(view: "recoder-terminal" | "recoder-diff", workspaceId: string) {
    // Loosely-typed def (like the hub's openBlock) so the workspace-id meta key
    // isn't rejected by the block MetaType literal check.
    const blockDef: { meta: Record<string, unknown> } = {
        meta: { view, "recoder:workspaceid": workspaceId },
    };
    try {
        await createBlock(blockDef);
    } catch {
        // degrade-safe: opening a sibling block should never take down Review
    }
}

function RecoderDiffView({ model }: ViewComponentProps<RecoderDiffViewModel>) {
    const workspaces = useAtomValue(model.workspacesAtom);
    const selectedId = useAtomValue(model.selectedIdAtom);
    const diff = useAtomValue(model.diffAtom);
    const connected = useAtomValue(model.connectedAtom);
    const loading = useAtomValue(model.loadingAtom);
    const diffLoading = useAtomValue(model.diffLoadingAtom);
    const diffStatus = useAtomValue(model.diffStatusAtom);
    const merging = useAtomValue(model.mergingAtom);
    const mergeStatus = useAtomValue(model.mergeStatusAtom);
    const prCreating = useAtomValue(model.prCreatingAtom);
    const prStatus = useAtomValue(model.prStatusAtom);
    const prView = useAtomValue(model.prViewAtom);
    const checks = useAtomValue(model.checksAtom);
    const checksLoading = useAtomValue(model.checksLoadingAtom);
    const discardStatus = useAtomValue(model.discardStatusAtom);
    const inlineApproval = useAtomValue(model.inlineApprovalAtom);
    const approvalDeciding = useAtomValue(model.approvalDecidingAtom);
    const approvalError = useAtomValue(model.approvalErrorAtom);

    useEffect(() => {
        model.refresh();
        const id = setInterval(() => model.refresh(), REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    // The secondary panels (checks · evidence · PR/merge) live in one collapsed
    // disclosure so the diff leads. Switching workspace resets to the calm default;
    // a real blocker (address-feedback / resolve-conflicts) auto-opens it so the
    // failing rows are never hidden — decisions live in reviewDetailsDefaultOpen.
    const reviewSuggestion = suggestReviewAction(checks);
    const [detailsOpen, setDetailsOpen] = useState(false);
    useEffect(() => {
        setDetailsOpen(reviewDetailsDefaultOpen(reviewSuggestion));
        // Re-evaluated per workspace only; the effect below re-opens if a blocker
        // arrives after checks finish loading.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId]);
    useEffect(() => {
        if (reviewDetailsDefaultOpen(reviewSuggestion)) {
            setDetailsOpen(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reviewSuggestion?.action]);

    const showNotConnected = !loading && !connected;
    const showNoWorkspaces = !loading && connected && workspaces.length == 0;
    const hasPatch = diff != null && diff.patch != null && diff.patch.trim() != "";

    // Exactly one loud header action for the current state (reviewPrimaryAction);
    // the non-primary action stays reachable — quiet — inside the tucked details
    // disclosure so no capability is lost. A live PR chip is a small status badge,
    // not an action, so it sits calmly beside the primary.
    const prChip = prView?.chip ?? null;
    const prGate = prCreateGate(prView);
    const primary = reviewPrimaryAction({
        hasSelection: selectedId != "",
        suggestion: reviewSuggestion,
        hasPr: prChip != null,
        canCreatePr: prGate.canCreate,
    });

    // The non-primary actions that must stay reachable in the tucked details area.
    const showMergeSecondary = primary != "merge";
    const showCreatePrSecondary = primary != "create-pr" && prChip == null;

    // The chord hint that rides the ONE loud action's label so the accelerator is
    // discoverable in place (never shown on the quiet secondary copies). Monochrome
    // and muted so it reads as a hint, not a second action.
    const chordHint = <span className="ml-1.5 font-mono opacity-60">{PRIMARY_CHORD_HINT}</span>;

    const mergeBtn = (className: string, chord = false) => (
        <button className={className} disabled={merging} onClick={() => model.mergeSelected()}>
            {merging ? "Merging…" : "Merge"}
            {chord && !merging && chordHint}
        </button>
    );
    const createPrBtn = (className: string, chord = false) => (
        <button
            className={className}
            disabled={prCreating || !prGate.canCreate}
            title={!prGate.canCreate ? prGate.reason : undefined}
            onClick={() => model.createPr()}
        >
            {prCreating ? "Creating PR…" : "Create PR"}
            {chord && !prCreating && chordHint}
        </button>
    );

    // The keyboard-fired primary: dispatch the SAME state-chosen action the loud
    // button runs, and only report it available when that button would actually be
    // enabled — so the ⌘⏎ chord is truthful (no effect while merging, or when Create
    // PR is gated). A blocked state ("none") is never available: no loud key action.
    const primaryAvailable =
        (primary == "merge" && !merging) || (primary == "create-pr" && !prCreating && prGate.canCreate);
    const runPrimary = () => {
        if (primary == "merge") {
            model.mergeSelected();
            return;
        }
        if (primary == "create-pr") {
            model.createPr();
        }
    };

    // The SHARED detail frame (identity + switcher + Session·Review·Terminal
    // segments) so Review reads as one face of the same workspace-detail Session
    // shows. Identity comes from the selected record; the raw-terminal segment is
    // wired only when that record carries a tmux session (truthful degrade).
    const selectedWorkspace = workspaces.find((w) => w.workspaceId == selectedId) ?? null;
    const detailIdentity = {
        branch: selectedWorkspace?.branch ?? "",
        repo: selectedWorkspace?.projectId,
        agent: selectedWorkspace?.runtimeId ? agentLabel(selectedWorkspace.runtimeId) : undefined,
        stateChip:
            selectedWorkspace != null && selectedWorkspace.state != ""
                ? { label: selectedWorkspace.state, tone: "neutral" as const }
                : undefined,
    };
    const detailSwitcher =
        workspaces.length > 0
            ? {
                  options: workspaces.map((w) => ({
                      id: w.workspaceId,
                      label: workspaceOptionLabel(w.branch, w.state),
                  })),
                  selectedId,
                  onSelect: (id: string) => model.selectWorkspace(id),
              }
            : undefined;
    const onOpenTerminal = selectedWorkspace?.sessionName
        ? () =>
              openWorkspaceTerminal({
                  sessionName: selectedWorkspace.sessionName,
                  cwd: selectedWorkspace.worktreePath,
              })
        : undefined;
    const hasHeaderPrimary = primary == "merge" || primary == "create-pr" || (selectedId != "" && prChip != null);
    const headerPrimary = (
        <div className="flex items-center gap-2">
            {primary == "merge" && mergeBtn(PRIMARY_BTN, true)}
            {primary == "create-pr" && createPrBtn(PRIMARY_BTN, true)}
            {selectedId != "" && prChip != null && <ReviewPrChip chip={prChip} />}
        </div>
    );

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <RecoderDetailHeader
                workspaceId={selectedId}
                view="review"
                identity={detailIdentity}
                switcher={detailSwitcher}
                onNavigate={(target) =>
                    openDetailBlock(target == "session" ? "recoder-terminal" : "recoder-diff", selectedId)
                }
                onOpenTerminal={onOpenTerminal}
                primaryAction={hasHeaderPrimary ? headerPrimary : undefined}
            />
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden p-3 gap-2">
            {inlineApproval != null && (
                <InlineApprovalCard
                    approval={inlineApproval}
                    deciding={approvalDeciding}
                    error={approvalError}
                    onApprove={() => model.decideInlineApproval("approve")}
                    onReject={() => model.decideInlineApproval("reject")}
                />
            )}
            {selectedId != "" && reviewSuggestion != null && (
                <div className="flex items-center gap-1.5 text-xs text-secondary">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent/70 shrink-0" />
                    <span>{reviewSuggestion.label}</span>
                </div>
            )}
            {mergeStatus != "" && <div className="text-xs text-secondary">{mergeStatus}</div>}
            {prStatus != "" && <div className="text-xs text-secondary">{prStatus}</div>}
            {discardStatus != "" && <div className="text-xs text-secondary">{discardStatus}</div>}
            {selectedId != "" && (
                <div className="flex flex-col rounded border border-white/8">
                    <button
                        className="flex items-center gap-2 px-2 py-1 text-xs text-secondary hover:text-primary focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-white/50 recoder-transition cursor-pointer"
                        aria-expanded={detailsOpen}
                        onClick={() => setDetailsOpen((v) => !v)}
                    >
                        <span className="select-none w-3 text-center opacity-70">{detailsOpen ? "▾" : "▸"}</span>
                        <span className="uppercase tracking-wide">Details</span>
                        <span className="text-meta">checks · evidence · PR</span>
                    </button>
                    {detailsOpen && (
                        <div className="flex flex-col gap-2 border-t border-white/8 px-2 py-2">
                            <ChecksStrip
                                checks={checks}
                                loading={checksLoading}
                                onRefresh={() => model.refreshChecks()}
                            />
                            {(showMergeSecondary || showCreatePrSecondary) && (
                                <div className="flex items-center gap-2 flex-wrap">
                                    {showMergeSecondary && mergeBtn(QUIET_BTN)}
                                    {showCreatePrSecondary && createPrBtn(QUIET_BTN)}
                                    {prChip == null && !prGate.canCreate && (
                                        <span className="text-xs text-secondary">Create PR unavailable — {prGate.reason}</span>
                                    )}
                                </div>
                            )}
                            <EvidencePanel workspaceId={selectedId} />
                        </div>
                    )}
                </div>
            )}

            {showNotConnected && (
                <RecoderEmpty title="Recoder is still starting…" hint="Your workspace diffs load once it is ready." />
            )}
            {showNoWorkspaces && (
                <RecoderEmpty
                    title="No workspaces yet"
                    hint="Press N in Workspaces to launch an agent, then review its diff here."
                />
            )}
            {loading && workspaces.length == 0 && <RecoderSkeleton rows={5} />}

            {selectedId != "" && (
                <div className="flex flex-col gap-2 overflow-hidden">
                    {diff != null && (
                        <div className="flex items-center gap-2 text-xs text-secondary">
                            <span>base {diff.baseRef}</span>
                            <span>·</span>
                            <span>{diff.changedFiles} changed</span>
                            {diff.untracked.length > 0 && (
                                <>
                                    <span>·</span>
                                    <span>{diff.untracked.length} untracked</span>
                                </>
                            )}
                        </div>
                    )}
                    {diffLoading && <RecoderSkeleton rows={8} />}
                    {!diffLoading && !hasPatch && (
                        <div className="text-secondary text-sm">{diffStatus != "" ? diffStatus : "No diff — the worktree matches its base."}</div>
                    )}
                    {!diffLoading && hasPatch && (
                        <DiffBody
                            patch={diff.patch}
                            model={model}
                            onPrimary={runPrimary}
                            primaryAvailable={primaryAvailable}
                        />
                    )}
                    {!diffLoading && hasPatch && <ReviewCommentQueue model={model} />}
                    {!diffLoading && diff != null && diff.untracked.length > 0 && (
                        <div className="flex flex-col gap-0.5">
                            <div className="text-xs uppercase tracking-wide text-secondary">Untracked</div>
                            {diff.untracked.map((f) => (
                                <div key={f} className="text-xs font-mono text-secondary">
                                    <span className="select-none opacity-70">+ </span>
                                    {f}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            </div>
        </div>
    );
}

RecoderDiffView.displayName = "RecoderDiffView";

export { RecoderDiffView };
