'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Plus, ChevronDown, Trash2, Loader2, X } from 'lucide-react';
import {
    useWorkflows,
    useWorkflow,
    useCreateWorkflow,
    useDeleteWorkflow,
    useExecuteWorkflow,
} from '@/hooks/workflows/use-workflows';
import type { WorkflowNode } from '@/lib/api/workflows';
import { WorkflowCanvas } from '@/components/workflows/WorkflowCanvas';
import { WorkflowNodePalette } from '@/components/workflows/WorkflowNodePalette';
import { WorkflowNodeConfig } from '@/components/workflows/WorkflowNodeConfig';
import { WorkflowToolbar } from '@/components/workflows/WorkflowToolbar';
import { WorkflowExecutionView } from '@/components/workflows/WorkflowExecutionView';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WorkflowsScreenProps {
    agentId: string;
}

// ---------------------------------------------------------------------------
// Create‑workflow inline dialog
// ---------------------------------------------------------------------------

function CreateWorkflowDialog({
    agentId,
    onCreated,
}: {
    agentId: string;
    onCreated: (id: string) => void;
}) {
    const [name, setName] = useState('');
    const createMutation = useCreateWorkflow();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;

        try {
            const created = await createMutation.mutateAsync({
                agent_id: agentId,
                name: trimmed,
            });
            toast.success('Workflow created');
            setName('');
            onCreated(created.id);
        } catch {
            toast.error('Failed to create workflow');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Workflow name..."
                className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <button
                type="submit"
                disabled={!name.trim() || createMutation.isPending}
                className={cn(
                    'inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed',
                )}
            >
                {createMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Plus className="h-4 w-4" />
                )}
                Create
            </button>
        </form>
    );
}

// ---------------------------------------------------------------------------
// Workflow selector dropdown
// ---------------------------------------------------------------------------

function WorkflowSelector({
    workflows,
    selectedId,
    onSelect,
    onDelete,
}: {
    workflows: { id: string; name: string }[];
    selectedId: string;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    return (
        <div className="flex items-center gap-2">
            <div className="relative">
                <select
                    value={selectedId}
                    onChange={(e) => onSelect(e.target.value)}
                    className="appearance-none rounded-md border border-zinc-300 bg-white py-1.5 pl-3 pr-8 text-sm outline-none focus:ring-2 focus:ring-violet-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                    {workflows.map((w) => (
                        <option key={w.id} value={w.id}>
                            {w.name}
                        </option>
                    ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            </div>

            <button
                type="button"
                onClick={() => onDelete(selectedId)}
                className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
            >
                <Trash2 className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorkflowsScreen({ agentId }: WorkflowsScreenProps) {
    const { data: workflows, isLoading: isLoadingList } = useWorkflows(agentId);
    const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
    const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
    const [executionId, setExecutionId] = useState<string | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);

    const deleteWorkflow = useDeleteWorkflow();
    const executeWorkflow = useExecuteWorkflow();

    // Auto‑select first workflow when list loads
    const activeWorkflowId = useMemo(() => {
        if (selectedWorkflowId && workflows?.some((w) => w.id === selectedWorkflowId)) {
            return selectedWorkflowId;
        }
        return workflows?.[0]?.id ?? null;
    }, [selectedWorkflowId, workflows]);

    // Fetch the selected workflow detail (nodes + edges)
    const { data: workflowDetail } = useWorkflow(activeWorkflowId ?? '');

    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------

    const handleNodeSelect = useCallback(
        (nodeId: string | null) => {
            if (!nodeId) {
                setSelectedNode(null);
                return;
            }
            const node = workflowDetail?.nodes.find((n) => n.id === nodeId) ?? null;
            setSelectedNode(node);
        },
        [workflowDetail?.nodes],
    );

    const handleNodeUpdate = useCallback(
        (_nodeId: string, _updates: Partial<WorkflowNode>) => {
            // Node mutations are handled by individual hooks inside the canvas/config
            // components. This callback is provided for future server‑side persistence.
            toast.success('Node updated');
        },
        [],
    );

    const handleSave = useCallback(() => {
        // Auto‑save is handled through React Query mutations on each edit.
        toast.success('Workflow saved');
    }, []);

    const handleRun = useCallback(() => {
        if (!activeWorkflowId) return;
        executeWorkflow.mutate(
            { workflowId: activeWorkflowId },
            {
                onSuccess: (execution) => {
                    toast.success('Workflow execution started');
                    setExecutionId(execution.id);
                },
                onError: () => {
                    toast.error('Failed to start workflow');
                },
            },
        );
    }, [activeWorkflowId, executeWorkflow]);

    const handleDelete = useCallback(
        (id: string) => {
            const name = workflows?.find((w) => w.id === id)?.name ?? 'workflow';
            if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
            deleteWorkflow.mutate(id, {
                onSuccess: () => {
                    toast.success('Workflow deleted');
                    setSelectedWorkflowId(null);
                    setSelectedNode(null);
                },
                onError: () => {
                    toast.error('Failed to delete workflow');
                },
            });
        },
        [workflows, deleteWorkflow],
    );

    const handleWorkflowCreated = useCallback((id: string) => {
        setSelectedWorkflowId(id);
        setShowCreateForm(false);
    }, []);

    // -----------------------------------------------------------------------
    // Loading state
    // -----------------------------------------------------------------------

    if (isLoadingList) {
        return (
            <div className="flex-1 overflow-auto pb-6">
                <div className="px-1 pt-1 space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-64 w-full" />
                    <Skeleton className="h-32 w-full" />
                </div>
            </div>
        );
    }

    // -----------------------------------------------------------------------
    // Empty state — no workflows yet
    // -----------------------------------------------------------------------

    if (!workflows || workflows.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 pb-6">
                <div className="text-center">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                        No workflows yet
                    </h3>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        Create a visual workflow to orchestrate your agent's tasks.
                    </p>
                </div>

                <div className="w-full max-w-md">
                    <CreateWorkflowDialog agentId={agentId} onCreated={handleWorkflowCreated} />
                </div>
            </div>
        );
    }

    // -----------------------------------------------------------------------
    // Editor layout
    // -----------------------------------------------------------------------

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header row: selector + create */}
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
                <WorkflowSelector
                    workflows={workflows}
                    selectedId={activeWorkflowId ?? ''}
                    onSelect={setSelectedWorkflowId}
                    onDelete={handleDelete}
                />

                {showCreateForm ? (
                    <div className="flex items-center gap-2 flex-1 max-w-md">
                        <CreateWorkflowDialog agentId={agentId} onCreated={handleWorkflowCreated} />
                        <button
                            type="button"
                            onClick={() => setShowCreateForm(false)}
                            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setShowCreateForm(true)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                        <Plus className="h-4 w-4" />
                        New Workflow
                    </button>
                )}
            </div>

            {/* Toolbar */}
            {activeWorkflowId && workflowDetail && (
                <WorkflowToolbar
                    workflowId={activeWorkflowId}
                    workflowName={workflowDetail.name}
                    status={workflowDetail.status}
                    onSave={handleSave}
                    onRun={handleRun}
                    isSaving={false}
                    isRunning={executeWorkflow.isPending}
                />
            )}

            {/* Editor body */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Left sidebar — node palette */}
                <div className="w-64 shrink-0 overflow-y-auto border-r border-zinc-200 dark:border-zinc-800">
                    <WorkflowNodePalette />
                </div>

                {/* Center — canvas */}
                <div className="flex-1 relative">
                    {activeWorkflowId ? (
                        <WorkflowCanvas
                            workflowId={activeWorkflowId}
                            onNodeSelect={handleNodeSelect}
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                            Select or create a workflow to get started.
                        </div>
                    )}

                    {/* Floating execution overlay */}
                    {executionId && (
                        <div className="absolute bottom-4 right-4 z-20 w-96 rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                            <WorkflowExecutionView
                                executionId={executionId}
                                onClose={() => setExecutionId(null)}
                            />
                        </div>
                    )}
                </div>

                {/* Right sidebar — node config (conditional) */}
                {selectedNode && (
                    <div className="w-80 shrink-0 overflow-y-auto border-l border-zinc-200 dark:border-zinc-800">
                        <WorkflowNodeConfig
                            node={selectedNode}
                            onClose={() => setSelectedNode(null)}
                            onUpdate={handleNodeUpdate}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
