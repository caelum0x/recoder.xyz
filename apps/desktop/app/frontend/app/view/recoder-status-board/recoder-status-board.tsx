// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { RecoderEmpty, RecoderErrorRow, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { PAGE_TITLE } from "@/app/view/recoder/recoder-styles";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { RecoderStatusBoardViewModel, STATUS_COLUMNS, type StatusCell, type StatusColumn } from "./recoder-status-board-model";
const REFRESH_MS = 6000;
function label(state: StatusColumn) { return state.replace(/_/g, " "); }
function Cell({ model, cell }: { model: RecoderStatusBoardViewModel; cell: StatusCell }) { return <button type="button" className="rounded border border-border px-2 py-1 text-left hover:border-accent/50" title={`${cell.workspaceId} · ${cell.nativeStatus}`} onClick={() => model.focusWorkspace(cell.workspaceId)}><div className="truncate text-sm">{cell.agentKind}</div><div className="text-xs text-secondary">{cell.nativeStatus}{cell.taskGroup ? ` · ${cell.taskGroup}` : ""}</div></button>; }
function RecoderStatusBoardView({ model }: ViewComponentProps<RecoderStatusBoardViewModel>) {
 const board = useAtomValue(model.boardAtom); const error = useAtomValue(model.errorAtom); const loading = useAtomValue(model.loadingAtom);
 useEffect(() => { model.load(); const id = setInterval(() => model.load(), REFRESH_MS); return () => clearInterval(id); }, [model]);
 return <div className="flex h-full flex-col gap-3 overflow-auto p-3"><div className="flex items-center gap-2"><span className={PAGE_TITLE}>Status Board</span>{board && <span className="ml-auto text-xs text-secondary">{board.total} live panes</span>}</div><RecoderErrorRow message={error}/>{loading && board == null && <RecoderSkeleton rows={3}/>} {board?.degraded && <div className="rounded border border-error/40 px-2 py-1 text-xs text-error">Snapshot degraded — {board.reason || "unavailable"}</div>} {board != null && <div className="grid min-w-max grid-flow-col auto-cols-[minmax(12rem,1fr)] gap-2">{STATUS_COLUMNS.map(state => <div key={state} className="flex min-w-[12rem] flex-col gap-1 rounded border border-border p-2"><div className="text-xs text-secondary">{label(state)} · {board.totals[state]}</div>{board.columns[state].map(cell => <Cell key={cell.workspaceId} model={model} cell={cell}/>)}</div>)}</div>}{board != null && !board.degraded && board.total == 0 && <RecoderEmpty title="No live panes" hint="Start a Loom-managed agent to populate this board."/>}</div>;
}
export { RecoderStatusBoardView };
