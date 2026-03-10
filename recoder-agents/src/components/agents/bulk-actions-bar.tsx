'use client';

import React, { useState, useEffect } from 'react';
import { Trash2, Download, Copy, X, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/lib/toast';
import { AgentComparisonDialog } from '@/components/agents/agent-comparison-dialog';

interface BulkActionsBarProps {
  selectedCount: number;
  selectedIds: string[];
  onDelete: (ids: string[]) => void;
  onExport: (ids: string[]) => void;
  onClone: (ids: string[]) => void;
  onClearSelection: () => void;
  isDeleting?: boolean;
}

export function BulkActionsBar({
  selectedCount,
  selectedIds,
  onDelete,
  onExport,
  onClone,
  onClearSelection,
  isDeleting = false,
}: BulkActionsBarProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Animate in/out
  useEffect(() => {
    if (selectedCount > 0) {
      // Small delay to trigger CSS transition
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [selectedCount]);

  // Listen for Escape to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedCount > 0 && !showDeleteConfirm) {
        onClearSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCount, onClearSelection, showDeleteConfirm]);

  if (selectedCount === 0) return null;

  return (
    <>
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-out ${
          isVisible
            ? 'translate-y-0 opacity-100'
            : 'translate-y-4 opacity-0'
        }`}
      >
        <div className="flex items-center gap-3 bg-background/95 backdrop-blur-md border border-border rounded-xl shadow-lg px-5 py-3">
          <span className="text-sm font-medium text-foreground whitespace-nowrap">
            {selectedCount} agent{selectedCount !== 1 ? 's' : ''} selected
          </span>

          <div className="w-px h-5 bg-border" />

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-sm h-8"
              onClick={() => setShowCompareDialog(true)}
              disabled={selectedCount < 2 || selectedCount > 5}
              title={
                selectedCount < 2
                  ? 'Select at least 2 agents to compare'
                  : selectedCount > 5
                    ? 'Select at most 5 agents to compare'
                    : 'Compare selected agents'
              }
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Compare
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-sm h-8"
              onClick={() => onExport(selectedIds)}
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-sm h-8"
              onClick={() => onClone(selectedIds)}
            >
              <Copy className="h-3.5 w-3.5" />
              Clone
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-sm h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>

          <div className="w-px h-5 bg-border" />

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onClearSelection}
            title="Cancel selection"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">Delete {selectedCount} Agent{selectedCount !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedCount} selected agent{selectedCount !== 1 ? 's' : ''}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete(selectedIds);
                setShowDeleteConfirm(false);
              }}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              {isDeleting ? 'Deleting...' : `Delete ${selectedCount} Agent${selectedCount !== 1 ? 's' : ''}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AgentComparisonDialog
        agentIds={selectedIds}
        open={showCompareDialog}
        onOpenChange={setShowCompareDialog}
      />
    </>
  );
}
