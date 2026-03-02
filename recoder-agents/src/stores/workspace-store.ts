import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { A2AWorkspace } from '@recoder/shared/a2a';

interface WorkspaceState {
  currentWorkspaceId: string | null;
  workspaces: A2AWorkspace[];
  isLoading: boolean;

  setCurrentWorkspace: (id: string | null) => void;
  setWorkspaces: (workspaces: A2AWorkspace[]) => void;
  setLoading: (loading: boolean) => void;
  addWorkspace: (workspace: A2AWorkspace) => void;
  removeWorkspace: (id: string) => void;
  updateWorkspace: (id: string, updates: Partial<A2AWorkspace>) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      currentWorkspaceId: null,
      workspaces: [],
      isLoading: false,

      setCurrentWorkspace: (id) => set({ currentWorkspaceId: id }),
      setWorkspaces: (workspaces) => set({ workspaces }),
      setLoading: (isLoading) => set({ isLoading }),
      addWorkspace: (workspace) =>
        set((state) => ({
          workspaces: [...state.workspaces, workspace],
        })),
      removeWorkspace: (id) =>
        set((state) => ({
          workspaces: state.workspaces.filter((ws) => ws.workspaceId !== id),
          currentWorkspaceId: state.currentWorkspaceId === id ? null : state.currentWorkspaceId,
        })),
      updateWorkspace: (id, updates) =>
        set((state) => ({
          workspaces: state.workspaces.map((ws) =>
            ws.workspaceId === id ? { ...ws, ...updates } : ws,
          ),
        })),
    }),
    {
      name: 'recoder-workspace',
      partialize: (state) => ({
        currentWorkspaceId: state.currentWorkspaceId,
      }),
    },
  ),
);

// Optimized selectors
export const useCurrentWorkspaceId = () =>
  useWorkspaceStore((state) => state.currentWorkspaceId);
export const useWorkspaces = () =>
  useWorkspaceStore((state) => state.workspaces);
export const useCurrentWorkspace = () =>
  useWorkspaceStore((state) =>
    state.workspaces.find((ws) => ws.workspaceId === state.currentWorkspaceId),
  );
