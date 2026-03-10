'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DisconnectDialogProps {
  provider: string;
  providerName: string;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function DisconnectDialog({
  provider,
  providerName,
  open,
  onClose,
  onConfirm,
  isLoading = false,
}: DisconnectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mb-2">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <DialogTitle className="text-center">
            Disconnect {providerName}?
          </DialogTitle>
          <DialogDescription className="text-center">
            This will revoke access. Agents using this integration may stop working.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center gap-3 pt-4">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Disconnecting...' : 'Disconnect'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
