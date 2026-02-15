"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import { useState } from "react";
import { toast } from "sonner";
import { syncAnalyticsConnector } from "@/actions/analytics/connectors";
import { syncSessionRecordings } from "@/actions/session-recordings/sync";

export type AnalyticsSyncTarget = {
  readonly id: string;
  readonly provider: "MIXPANEL" | "AMPLITUDE" | "POSTHOG";
  readonly status: string | null;
};

type SyncActionsProps = {
  readonly analyticsConnectors: AnalyticsSyncTarget[];
  readonly hasSessionProvider: boolean;
};

export const SyncActions = ({
  analyticsConnectors,
  hasSessionProvider,
}: SyncActionsProps) => {
  const [syncingAnalytics, setSyncingAnalytics] = useState<string | null>(null);
  const [syncingSession, setSyncingSession] = useState(false);

  const handleAnalyticsSync = async (
    provider: AnalyticsSyncTarget["provider"]
  ) => {
    setSyncingAnalytics(provider);

    try {
      const response = await syncAnalyticsConnector(provider);

      if ("error" in response) {
        throw new Error(response.error);
      }

      toast.success("Analytics sync started");
    } catch (error) {
      handleError(error);
    } finally {
      setSyncingAnalytics(null);
    }
  };

  const handleSessionSync = async () => {
    setSyncingSession(true);

    try {
      const response = await syncSessionRecordings();

      if ("error" in response) {
        throw new Error(response.error);
      }

      toast.success("Session recordings sync started");
    } catch (error) {
      handleError(error);
    } finally {
      setSyncingSession(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {analyticsConnectors.map((connector) => (
        <Button
          disabled={syncingAnalytics === connector.provider}
          key={connector.id}
          onClick={() => handleAnalyticsSync(connector.provider)}
          size="sm"
          variant="outline"
        >
          {syncingAnalytics === connector.provider
            ? `Syncing ${connector.provider}...`
            : `Sync ${connector.provider}`}
        </Button>
      ))}
      <Button
        disabled={!hasSessionProvider || syncingSession}
        onClick={handleSessionSync}
        size="sm"
        variant="outline"
      >
        {syncingSession
          ? "Syncing session recordings..."
          : "Sync session recordings"}
      </Button>
    </div>
  );
};
