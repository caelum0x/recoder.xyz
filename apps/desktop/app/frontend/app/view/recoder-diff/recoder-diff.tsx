// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { computeDiffLineAnchors, type DiffLineAnchor } from "./recoder-diff-comments";
import { parseDiffFileSections, type DiffFileSection } from "./recoder-diff-files";
import {
    isFailedConclusion,
    RecoderDiffViewModel,
    suggestReviewAction,
    type RecoderCheckRow,
    type RecoderReviewActionId,
    type RecoderWorkspaceChecks,
} from "./recoder-diff-model";
import { EvidencePanel } from "./recoder-evidence-panel";

const REFRESH_MS = 6000;

const PRIMARY_BTN =
    "bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer disabled:opacity-50";
const QUIET_BTN =
    "border border-border text-secondary rounded px-2 py-0.5 text-sm hover:bg-border/40 transition-colors cursor-pointer disabled:opacity-50";

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
                        +💬
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

function fileLabel(section: DiffFileSection): string {
    return section.path != "" ? section.path : "(file)";
}

// The jump list above the diff: one row per file (path · +adds/-dels) that
// scrolls to — and expands — its section. Only shown for multi-file diffs.
function DiffFileList({ sections, onJump }: { sections: DiffFileSection[]; onJump: (i: number) => void }) {
    return (
        <div className="flex flex-col gap-0.5 rounded border border-border p-2 bg-panel">
            <div className="text-xs uppercase tracking-wide text-secondary">{sections.length} files</div>
            {sections.map((section, i) => (
                <button
                    key={i}
                    className="flex items-center gap-2 text-left text-xs font-mono text-secondary hover:text-primary transition-colors cursor-pointer"
                    title={`Jump to ${fileLabel(section)}`}
                    onClick={() => onJump(i)}
                >
                    <span className="flex-1 truncate">{fileLabel(section)}</span>
                    <span className="text-primary/70 shrink-0">+{section.adds}</span>
                    <span className="text-error/70 shrink-0">-{section.dels}</span>
                </button>
            ))}
        </div>
    );
}

// The collapsible per-file header inside the diff. Sticky so the filename stays
// visible while scrolling its hunks; the caret encodes collapsed/expanded.
function DiffFileHeader({
    section,
    collapsed,
    onToggle,
}: {
    section: DiffFileSection;
    collapsed: boolean;
    onToggle: () => void;
}) {
    return (
        <button
            className="flex w-full items-center gap-2 text-left text-xs font-mono text-secondary hover:text-primary transition-colors cursor-pointer py-0.5 sticky top-0 bg-panel z-10"
            onClick={onToggle}
        >
            <span className="select-none w-3 text-center opacity-70">{collapsed ? "▸" : "▾"}</span>
            <span className="flex-1 truncate text-primary/80">{fileLabel(section)}</span>
            <span className="text-primary/70 shrink-0">+{section.adds}</span>
            <span className="text-error/70 shrink-0">-{section.dels}</span>
        </button>
    );
}

function DiffBody({ patch, model }: { patch: string; model: RecoderDiffViewModel }) {
    const lines = patch.split("\n");
    const anchors = computeDiffLineAnchors(patch);
    const sections = parseDiffFileSections(patch);
    // Which rendered line has its comment composer open (-1 = none). Local UI
    // state: the enqueued comments themselves live on the model.
    const [activeLine, setActiveLine] = useState(-1);
    // Per-section collapsed flags (default expanded). Keyed by section index.
    const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
    const sectionRefs = useRef<Record<number, HTMLDivElement>>({});

    const setCollapsedFor = (i: number, value: boolean) => setCollapsed((prev) => ({ ...prev, [i]: value }));

    const jumpTo = (i: number) => {
        setCollapsedFor(i, false);
        // Expand first, then scroll on the next frame so the section is mounted.
        requestAnimationFrame(() => sectionRefs.current[i]?.scrollIntoView({ block: "start" }));
    };

    return (
        <div className="flex flex-col gap-2 min-h-0 overflow-hidden">
            {sections.length > 1 && <DiffFileList sections={sections} onJump={jumpTo} />}
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
                            />
                            {!isCollapsed &&
                                lines.slice(section.startIndex, section.endIndex).map((line, offset) => {
                                    const globalIndex = section.startIndex + offset;
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
                        ✕
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
    const checks = useAtomValue(model.checksAtom);
    const checksLoading = useAtomValue(model.checksLoadingAtom);

    useEffect(() => {
        model.refresh();
        const id = setInterval(() => model.refresh(), REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    const showNotConnected = !loading && !connected;
    const showNoWorkspaces = !loading && connected && workspaces.length == 0;
    const hasPatch = diff != null && diff.patch != null && diff.patch.trim() != "";

    // Checks-driven next step. Promotes exactly one header button when it IS the
    // suggested action; with no suggestion, Merge keeps its default primary (the
    // review→merge close) so the header never looks unowned.
    const reviewSuggestion = suggestReviewAction(checks);
    const reviewBtnClass = (action: RecoderReviewActionId): string =>
        reviewSuggestion != null && reviewSuggestion.action == action ? PRIMARY_BTN : QUIET_BTN;

    return (
        <div className="flex flex-col h-full overflow-hidden p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className="font-semibold">Recoder — Review</span>
                {workspaces.length > 0 && (
                    <select
                        className="ml-auto bg-panel text-primary border border-border rounded px-2 py-0.5 text-sm cursor-pointer"
                        value={selectedId}
                        onChange={(e) => model.selectWorkspace(e.target.value)}
                    >
                        {workspaces.map((ws) => (
                            <option key={ws.workspaceId} value={ws.workspaceId}>
                                {ws.branch} · {ws.state}
                            </option>
                        ))}
                    </select>
                )}
                {selectedId != "" && (
                    <button
                        className={reviewSuggestion != null ? reviewBtnClass("merge") : PRIMARY_BTN}
                        disabled={merging}
                        onClick={() => model.mergeSelected()}
                    >
                        {merging ? "Merging…" : "Merge"}
                    </button>
                )}
                {selectedId != "" && (
                    <button className={reviewBtnClass("create-pr")} disabled={prCreating} onClick={() => model.createPr()}>
                        {prCreating ? "Creating PR…" : "Create PR"}
                    </button>
                )}
            </div>
            {selectedId != "" && (
                <ChecksStrip checks={checks} loading={checksLoading} onRefresh={() => model.refreshChecks()} />
            )}
            {selectedId != "" && reviewSuggestion != null && (
                <div className="flex items-center gap-1.5 text-xs text-secondary">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent/70 shrink-0" />
                    <span>{reviewSuggestion.label}</span>
                </div>
            )}
            {mergeStatus != "" && <div className="text-xs text-secondary">{mergeStatus}</div>}
            {prStatus != "" && <div className="text-xs text-secondary">{prStatus}</div>}
            {selectedId != "" && <EvidencePanel workspaceId={selectedId} />}

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
                    {!diffLoading && hasPatch && <DiffBody patch={diff.patch} model={model} />}
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
    );
}

RecoderDiffView.displayName = "RecoderDiffView";

export { RecoderDiffView };
