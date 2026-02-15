"use client";

import type { SlackInstallation } from "@repo/backend/prisma/client";
import { Switch } from "@repo/design-system/components/precomposed/switch";
import { StackCard } from "@repo/design-system/components/stack-card";
import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import { useRouter } from "next/navigation";
import { type FormEventHandler, useState } from "react";
import { toast } from "sonner";
import { deleteSlackInstallation } from "@/actions/slack-installation/delete";
import { testSlackInstallation } from "@/actions/slack-installation/test";
import { updateSlackInstallation } from "@/actions/slack-installation/update";

type ManageSlackProps = {
  id: SlackInstallation["id"];
  dataHealthAlertsEnabled: boolean;
};

export const ManageSlack = ({
  id,
  dataHealthAlertsEnabled,
}: ManageSlackProps) => {
  const [loading, setLoading] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(dataHealthAlertsEnabled);
  const router = useRouter();

  const handleDelete: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);

    try {
      const response = await deleteSlackInstallation(id);

      if ("error" in response) {
        throw new Error(response.error);
      }

      toast.success("Slack integration removed");

      setTimeout(() => {
        router.refresh();
      }, 1000);
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (loading) {
      return;
    }

    setLoading(true);

    try {
      const response = await testSlackInstallation();

      if ("error" in response) {
        throw new Error(response.error);
      }

      toast.success("Done! You should receive a message in Slack.");
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAlertsToggle = async (next: boolean) => {
    setAlertsEnabled(next);

    try {
      const response = await updateSlackInstallation(id, {
        dataHealthAlertsEnabled: next,
      });

      if ("error" in response) {
        throw new Error(response.error);
      }

      toast.success("Slack alert preferences updated");
    } catch (error) {
      setAlertsEnabled((prev) => !prev);
      handleError(error);
    }
  };

  return (
    <>
      <div className="grid gap-2">
        <h1 className="m-0 font-semibold text-4xl tracking-tight">Slack</h1>
        <p className="mb-0 text-muted-foreground">
          Manage your Slack integration.
        </p>
      </div>

      <StackCard className="p-4" title="Data Health Alerts">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="m-0 font-medium text-sm">
              Send data health alerts to Slack
            </p>
            <p className="m-0 text-muted-foreground text-xs">
              Posts when connectors fail or data is stale.
            </p>
          </div>
          <Switch
            checked={alertsEnabled}
            onCheckedChange={handleAlertsToggle}
          />
        </div>
      </StackCard>

      <StackCard className="p-4" title="Test Slack Integration">
        <Button disabled={loading} onClick={handleTest} variant="outline">
          Test Slack Integration
        </Button>
      </StackCard>

      <StackCard className="p-4" title="Danger Zone">
        <form onSubmit={handleDelete}>
          <Button disabled={loading} type="submit" variant="destructive">
            Remove Slack Integration
          </Button>
        </form>
      </StackCard>
    </>
  );
};
