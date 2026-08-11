// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure derivation of a CLEAN conversation transcript from the raw run-event
// stream (design 3B): the Session should read as the agent's turns — what it DID
// and SAID, and your steer inputs — not as a scrolling engine log. This module
// folds consecutive entries into readable TURNS, attributes them to "you" vs the
// agent, and pushes raw plumbing (ANSI paint, tool-call frames, transport system
// frames) into a quiet collapsed noise bucket instead of the main flow.
//
// Kept view-free (no React/atoms) so vitest can exercise grouping, noise-drop,
// attribution, and the empty case without a DOM. Nothing here fabricates a turn:
// an empty stream derives to [] and the view shows a calm waiting state.

import type { RunEventDescriptor, RunEventSeverity } from "./recoder-run-event";

// Structurally identical to the model's RunStreamEntry, declared locally so this
// pure module never imports the stateful ViewModel (no runtime cycle). The view
// passes its RunStreamEntry[] straight in — the shapes line up by construction.
type ConversationEntry =
    | { kind: "event"; descriptor: RunEventDescriptor }
    | { kind: "system"; text: string; tone: "error" | "muted" };

// Who a turn belongs to. We deliberately say "agent" (never the runtime/engine
// name) so the transcript stays engine-invisible per the house rules.
type TurnSpeaker = "you" | "agent";

// One salient line inside a turn. `label` is the event's short lifecycle word
// ("Verified", "Needs approval") or "" for plain prose; `text` is the human
// content. An approval line carries the decidable id so the view can render
// inline approve/deny exactly where it happened in the conversation.
interface TurnLine {
    label: string;
    text: string;
    severity: RunEventSeverity;
    approvalId?: string;
}

// A calm block of the conversation: one speaker, the clean lines they produced,
// and a quiet `noise` bucket of the raw chatter that ran underneath (collapsed
// in the view, never fabricated, never fully hidden).
interface Turn {
    speaker: TurnSpeaker;
    time: string;
    lines: TurnLine[];
    noise: string[];
}

// CSI escape sequences raw terminal paint carries. The leading ESC byte is
// required so ordinary prose with brackets ("line[0]") is never mistaken for
// repaint chatter and wrongly hidden from the transcript.
const AnsiEscape = /\x1b\[[0-9;?]*[ -/]*[@-~]/;

// Structured tool-call plumbing an agent runtime emits around a tool use. These
// are the mechanics of HOW the agent worked, not WHAT it did — collapse them.
const ToolFrame = /^(tool[_ ]?call|tool[_ ]?result|tool[_ ]?use|function[_ ]?call|<\/?tool\b)/i;

function stripAnsi(text: string): string {
    return text.replace(new RegExp(AnsiEscape, "g"), "");
}

// A `log` frame is raw plumbing (not agent prose) when it is empty, is pure
// terminal paint, or is a structured tool-call frame. Everything else a log
// carries is treated as the agent actually talking and stays in the transcript.
function isPlumbingLog(detail: string): boolean {
    if (AnsiEscape.test(detail)) return true;
    const trimmed = detail.trim();
    if (trimmed == "") return true;
    return ToolFrame.test(trimmed);
}

// The speaker a single entry belongs to: your steer inputs come back on the wire
// as `user_message` events; everything else (agent actions, logs, and transport
// system frames) sits on the agent side of the conversation.
function speakerOf(entry: ConversationEntry): TurnSpeaker {
    if (entry.kind == "event" && entry.descriptor.kind == "user_message") return "you";
    return "agent";
}

function entryTime(entry: ConversationEntry): string {
    return entry.kind == "event" ? entry.descriptor.time : "";
}

// Classify an entry into the salient line it contributes, or null when it is
// noise (the caller diverts null into the turn's collapsed `noise` bucket). A
// prose `log` keeps its cleaned text with no label so it reads as plain speech;
// a lifecycle event keeps its label so "Verified"/"Completed" stay meaningful.
function classifyEntry(entry: ConversationEntry): TurnLine | null {
    if (entry.kind == "system") return null;
    const d = entry.descriptor;
    if (d.kind == "log" && d.origin == "run" && isPlumbingLog(d.detail)) return null;

    if (d.kind == "user_message") {
        return { label: "", text: d.detail != "" ? d.detail : "(message)", severity: d.severity };
    }
    // A run-origin log is the agent talking — show it as clean prose, no label. A
    // sandbox-origin log is a lifecycle frame the bridge folds onto the stream, so
    // it keeps its label ("Sandbox provisioning") via the generic branch below.
    if (d.kind == "log" && d.origin == "run") {
        return { label: "", text: stripAnsi(d.detail).trim(), severity: d.severity };
    }
    const line: TurnLine = { label: d.label, text: d.detail, severity: d.severity };
    if (d.approvalId != null) line.approvalId = d.approvalId;
    return line;
}

// The raw text an entry contributes to the collapsed noise bucket, so nothing is
// silently discarded — a curious user can still expand the plumbing.
function noiseText(entry: ConversationEntry): string {
    if (entry.kind == "system") return entry.text;
    const d = entry.descriptor;
    return d.detail != "" ? `${d.label}  ${d.detail}` : d.label;
}

// Fold the raw run-event stream into the clean transcript: consecutive entries
// from the same speaker collapse into one Turn, salient lines flow into the turn
// body, and plumbing/system frames divert into that turn's quiet noise bucket.
// An empty stream derives to [] (the view then shows a calm waiting state, never
// a fabricated turn).
function deriveTranscript(entries: readonly ConversationEntry[]): Turn[] {
    const turns: Turn[] = [];
    let current: Turn | null = null;
    for (const entry of entries ?? []) {
        const speaker = speakerOf(entry);
        if (current == null || current.speaker != speaker) {
            current = { speaker, time: entryTime(entry), lines: [], noise: [] };
            turns.push(current);
        } else if (current.time == "") {
            // Anchor the turn's timestamp to its first entry that actually carries
            // one (a leading system frame has no time of its own).
            current.time = entryTime(entry);
        }
        const line = classifyEntry(entry);
        if (line != null) {
            current.lines.push(line);
        } else {
            current.noise.push(noiseText(entry));
        }
    }
    return turns;
}

// A hydrated historical message from the backend transcript edge
// (GET …/workspaces/:id/transcript). Structurally the backend's TranscriptMessage,
// declared locally so this pure module never imports a backend package.
type HydratedMessage = {
    role: "user" | "assistant" | "system";
    text: string;
    timestamp: string;
};

// Project a hydrated transcript (durable history read on Session attach) into the
// SAME Turn shape the live stream folds to, so seeded history and live replay
// render identically: your turns attribute to "you", the agent's to "agent",
// consecutive same-speaker messages collapse into one calm turn, and each message
// is plain prose (empty label) — never a fabricated line. An empty history
// projects to [] (the view keeps its calm waiting state).
function messagesToTurns(messages: readonly HydratedMessage[]): Turn[] {
    const turns: Turn[] = [];
    let current: Turn | null = null;
    for (const msg of messages ?? []) {
        const text = msg.text ?? "";
        if (text == "") continue;
        const speaker: TurnSpeaker = msg.role == "user" ? "you" : "agent";
        if (current == null || current.speaker != speaker) {
            current = { speaker, time: msg.timestamp ?? "", lines: [], noise: [] };
            turns.push(current);
        } else if (current.time == "") {
            current.time = msg.timestamp ?? "";
        }
        current.lines.push({ label: "", text, severity: "info" });
    }
    return turns;
}

export {
    deriveTranscript,
    messagesToTurns,
    isPlumbingLog,
    stripAnsi,
    type ConversationEntry,
    type HydratedMessage,
    type Turn,
    type TurnLine,
    type TurnSpeaker,
};
