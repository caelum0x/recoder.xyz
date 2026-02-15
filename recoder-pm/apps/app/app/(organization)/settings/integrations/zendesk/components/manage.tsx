"use client";

import { StackCard } from "@repo/design-system/components/stack-card";
import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import { formatDate } from "@repo/lib/format";
import { type FormEventHandler, useState } from "react";
import { toast } from "sonner";
import { deleteZendeskInstallation } from "@/actions/zendesk-installation/delete";
import { syncZendeskInstallation } from "@/actions/zendesk-installation/sync";

type ManageZendeskProps = {
  readonly subdomain: string;
  readonly email: string;
  readonly keyPreview: string | null;
  readonly lastSyncedAt: Date | null;
  readonly status: string;
};

export const ManageZendesk = ({
  subdomain,
  email,
  keyPreview,
  lastSyncedAt,
  status,
}: ManageZendeskProps) => {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleDelete: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);

    try {
      const response = await deleteZendeskInstallation();

      if ("error" in response) {
        throw new Error(response.error);
      }

      toast.success("Zendesk integration removed");
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (syncing) {
      return;
    }

    setSyncing(true);

    try {
      const response = await syncZendeskInstallation();

      if ("error" in response) {
        throw new Error(response.error);
      }

      toast.success("Zendesk sync started");
    } catch (error) {
      handleError(error);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="m-0 font-semibold text-4xl tracking-tight">Zendesk</h1>
        <p className="mb-0 text-muted-foreground">
          Manage your Zendesk integration.
        </p>
      </div>

      <StackCard className="p-4" title="Details">
        <div className="grid gap-2 text-muted-foreground text-sm">
          <div>Subdomain: {subdomain}</div>
          <div>Email: {email}</div>
          {keyPreview ? <div>API token: {keyPreview}</div> : null}
          <div>Status: {status}</div>
          {lastSyncedAt ? (
            <div>Last synced: {formatDate(lastSyncedAt)}</div>
          ) : (
            <div>Last synced: never</div>
          )}
        </div>
        <div className="mt-4">
          <Button onClick={handleSync} type="button" variant="outline">
            {syncing ? "Syncing..." : "Sync now"}
          </Button>
        </div>
      </StackCard>

      <StackCard className="p-4" title="Danger Zone">
        <form onSubmit={handleDelete}>
          <Button type="submit" variant="destructive">
            Remove Zendesk Integration
          </Button>
        </form>
      </StackCard>
    </div>
  );
};
