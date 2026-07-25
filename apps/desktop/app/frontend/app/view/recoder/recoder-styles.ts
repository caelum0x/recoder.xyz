// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Shared token strings so the Workspaces hub and the Compare panel render on one
// spacing/typography/motion rhythm instead of drifting apart over time.

const PRIMARY_BTN =
    "bg-accent/80 text-primary rounded px-2.5 py-1 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/70 active:bg-accent/70 transition-all duration-150 ease-out cursor-pointer disabled:opacity-50 disabled:cursor-default";

const QUIET_BTN =
    "border border-white/8 text-secondary rounded px-2 py-0.5 text-sm hover:bg-border/40 hover:text-primary hover:border-white/12 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border active:bg-border/60 transition-all duration-150 ease-out cursor-pointer disabled:opacity-50 disabled:cursor-default";

const QUIET_BTN_XS =
    "border border-white/8 text-secondary rounded px-1.5 py-0.5 text-xs hover:bg-border/40 hover:text-primary hover:border-white/12 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border active:bg-border/60 transition-all duration-150 ease-out cursor-pointer disabled:opacity-50 disabled:cursor-default";

const CHIP =
    "border border-white/8 text-secondary rounded px-2 py-0.5 text-xs hover:bg-border/40 hover:text-primary transition-all duration-150 ease-out cursor-pointer truncate max-w-[16rem]";

const PICK_BTN_ON =
    "border border-accent/50 bg-accent/25 text-accent rounded px-1.5 py-0.5 text-xs transition-all duration-150 ease-out cursor-pointer";

const SAVE_BTN =
    "border border-accent/40 text-accent rounded px-2 py-0.5 text-xs hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 transition-all duration-150 ease-out cursor-pointer";

const INPUT =
    "rounded border border-white/8 bg-transparent px-2 py-1 text-sm focus:outline-none focus:border-accent/60 transition-colors duration-150";

const ERROR_ROW =
    "flex items-start gap-1.5 rounded border border-error/40 bg-error/10 text-error text-sm px-2 py-1";

const SKELETON_ROW = "h-7 rounded border border-white/8 bg-border/20 animate-pulse";

const PAGE_TITLE = "text-sm font-medium tracking-tight text-primary";
const SECTION_TITLE = "text-sm font-medium tracking-tight text-primary";
const FIELD_LABEL = "text-xs uppercase tracking-wide text-secondary";
const ROW_TITLE = "text-sm text-primary tracking-tight";
const META = "text-xs text-meta tracking-tight";

export {
    CHIP,
    ERROR_ROW,
    FIELD_LABEL,
    INPUT,
    META,
    PAGE_TITLE,
    PICK_BTN_ON,
    PRIMARY_BTN,
    QUIET_BTN,
    QUIET_BTN_XS,
    ROW_TITLE,
    SAVE_BTN,
    SECTION_TITLE,
    SKELETON_ROW,
};
