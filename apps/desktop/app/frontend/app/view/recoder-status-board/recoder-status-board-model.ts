// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock, globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorReason } from "../recoder/recoder-errors";
import { workspaceDetailMeta } from "../recoder/recoder-detail-open";
import { RecoderStatusBoardView } from "./recoder-status-board";

const STATUS_COLUMNS = ["awaiting_approval", "agent_idle_prompt", "review_ready", "working", "error", "unknown"] as const;
type StatusColumn = (typeof STATUS_COLUMNS)[number];
type StatusCell = { workspaceId: string; agentKind: string; taskGroup?: string; nativeStatus: string };
type StatusBoardView = { columns: Record<StatusColumn, StatusCell[]>; totals: Record<StatusColumn, number>; total: number; degraded: boolean; reason: string };

function emptyBoard(): StatusBoardView {
    const columns = {} as Record<StatusColumn, StatusCell[]>;
    const totals = {} as Record<StatusColumn, number>;
    for (const state of STATUS_COLUMNS) { columns[state] = []; totals[state] = 0; }
    return { columns, totals, total: 0, degraded: false, reason: "" };
}

function projectBoard(raw: unknown): StatusBoardView {
    const source = raw != null && typeof raw == "object" ? raw as Record<string, unknown> : {};
    const board = emptyBoard();
    board.degraded = source.degraded === true;
    board.reason = typeof source.reason == "string" ? source.reason : "";
    for (const state of STATUS_COLUMNS) {
        const values = Array.isArray(source.columns && typeof source.columns == "object" ? (source.columns as Record<string, unknown>)[state] : null)
            ? (source.columns as Record<string, unknown>)[state] as unknown[] : [];
        board.columns[state] = values.flatMap(value => {
            const cell = value != null && typeof value == "object" ? value as Record<string, unknown> : {};
            const workspaceId = typeof cell.workspaceId == "string" ? cell.workspaceId : "";
            if (workspaceId == "") return [];
            return [{ workspaceId, agentKind: typeof cell.agentKind == "string" ? cell.agentKind : workspaceId, ...(typeof cell.taskGroup == "string" ? { taskGroup: cell.taskGroup } : {}), nativeStatus: typeof cell.nativeStatus == "string" ? cell.nativeStatus : "unknown" }];
        });
        board.totals[state] = board.columns[state].length;
    }
    board.total = STATUS_COLUMNS.reduce((n, state) => n + board.totals[state], 0);
    return board;
}

class RecoderStatusBoardViewModel implements ViewModel {
    viewType = "recoder-status-board";
    viewIcon: Atom<string> = atom("table-columns");
    viewName: Atom<string> = atom("Status Board");
    blockId: string;
    boardAtom: PrimitiveAtom<StatusBoardView | null> = atom(null) as PrimitiveAtom<StatusBoardView | null>;
    errorAtom: PrimitiveAtom<string> = atom("") as PrimitiveAtom<string>;
    loadingAtom: PrimitiveAtom<boolean> = atom(false) as PrimitiveAtom<boolean>;
    constructor(initOpts: ViewModelInitType) { this.blockId = initOpts.blockId; }
    get viewComponent(): ViewComponent { return RecoderStatusBoardView; }
    async load() {
        globalStore.set(this.loadingAtom, true); globalStore.set(this.errorAtom, "");
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/mcp/tools/conductor/recoder_status_board/call`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ args: {} }) });
            const body = await res.json().catch(() => null);
            const data = body?.data;
            if (!res.ok || data?.status != "completed") throw new Error(readErrorReason(body) || data?.reason || "Status board unavailable.");
            globalStore.set(this.boardAtom, projectBoard(data.result));
            RecoderConnectionModel.getInstance().noteRefresh(true);
        } catch (error) { globalStore.set(this.errorAtom, error instanceof Error ? error.message : "Status board unavailable."); RecoderConnectionModel.getInstance().noteRefresh(false); }
        finally { globalStore.set(this.loadingAtom, false); }
    }
    async focusWorkspace(workspaceId: string) { if (workspaceId.trim() == "") return; const meta = workspaceDetailMeta("session", workspaceId); try { await createBlock({ meta }); } catch {} }
}

export { RecoderStatusBoardViewModel, STATUS_COLUMNS, projectBoard, type StatusBoardView, type StatusCell, type StatusColumn };
