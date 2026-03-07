"use client";

import { Input } from "@repo/design-system/components/precomposed/input";
import { Select } from "@repo/design-system/components/precomposed/select";
import { StackCard } from "@repo/design-system/components/stack-card";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import { formatDate } from "@repo/lib/format";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { disconnectSessionRecordings } from "@/actions/session-recordings/disconnect";
import { syncSessionRecordings } from "@/actions/session-recordings/sync";
import {
  type SessionRecordingProvider,
  updateSessionRecordingSettings,
} from "@/actions/session-recordings/update";

type SessionRecordingLog = {
  readonly id: string;
  readonly status: string;
  readonly provider: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly insightsIngested: number;
  readonly error: string | null;
};

type SessionRecordingSettingsProps = {
  readonly provider: SessionRecordingProvider | null;
  readonly keyPreview: string | null;
  readonly lastSyncedAt: Date | null;
  readonly config: Record<string, unknown>;
  readonly totalInsights: number;
  readonly lastInsightAt: Date | null;
  readonly logs: SessionRecordingLog[];
};

const providerOptions = [
  { label: "FullStory", value: "FULLSTORY" },
  { label: "Hotjar", value: "HOTJAR" },
] satisfies { label: string; value: SessionRecordingProvider }[];

const providerDocs: Record<SessionRecordingProvider, string> = {
  FULLSTORY: "https://developer.fullstory.com/",
  HOTJAR:
    "https://help.hotjar.com/hc/en-us/articles/115009336727-Hotjar-REST-API",
};

const providerHelp: Record<SessionRecordingProvider, string> = {
  FULLSTORY: "Use a FullStory API key with access to insights.",
  HOTJAR: "Use a Hotjar API token and Site ID from your Hotjar settings.",
};

const statusBadge = (status: string) => {
  if (status === "SUCCESS") {
    return "default" as const;
  }
  if (status === "ERROR") {
    return "destructive" as const;
  }
  return "secondary" as const;
};

export const SessionRecordingSettings = ({
  provider,
  keyPreview,
  lastSyncedAt,
  config,
  totalInsights,
  lastInsightAt,
  logs,
}: SessionRecordingSettingsProps) => {
  const [selectedProvider, setSelectedProvider] =
    useState<SessionRecordingProvider>(provider ?? "FULLSTORY");
  const [apiKey, setApiKey] = useState("");
  const [siteId, setSiteId] = useState(String(config.siteId ?? ""));
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const isHotjar = selectedProvider === "HOTJAR";
  const readyToSync = Boolean(provider && keyPreview);
  const syncLogs = useMemo(() => logs.slice(0, 5), [logs]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setLoading(true);

    try {
      const response = await updateSessionRecordingSettings({
        provider: selectedProvider,
        apiKey,
        siteId: isHotjar ? siteId : undefined,
      });

      if ("error" in response) {
        throw new Error(response.error);
      }

      toast.success(
        provider ? "Session recording settings updated" : "Provider connected"
      );
      setApiKey("");
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);

    try {
      const response = await syncSessionRecordings();

      if ("error" in response) {
        throw new Error(response.error);
      }

      toast.success("Sync started");
    } catch (error) {
      handleError(error);
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);

    try {
      const response = await disconnectSessionRecordings();

      if ("error" in response) {
        throw new Error(response.error);
      }

      toast.success("Disconnected");
    } catch (error) {
      handleError(error);
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="m-0 font-semibold text-4xl tracking-tight">
          Session Recordings
        </h1>
        <p className="mb-0 text-muted-foreground">
          Connect FullStory or Hotjar to ingest session insights.
        </p>
      </div>

      <StackCard title="Connection">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Select
            data={providerOptions}
            label="Provider"
            onChange={(value) => setSelectedProvider(value as SessionRecordingProvider)}
            value={selectedProvider}
          />
          <div className="text-muted-foreground text-xs">
            <a
              className="text-primary"
              href={providerDocs[selectedProvider]}
              rel="noreferrer"
              target="_blank"
            >
              View provider docs →
            </a>
          </div>
          {isHotjar ? (
            <Input
              className="bg-background"
              label="Hotjar Site ID"
              onChangeText={setSiteId}
              placeholder="123456"
              value={siteId}
            />
          ) : null}
          <Input
            className="bg-background"
            label="API Key"
            onChangeText={setApiKey}
            placeholder="API key"
            type="password"
            value={apiKey}
          />
          <p className="text-muted-foreground text-xs">
            {providerHelp[selectedProvider]}
          </p>
          {keyPreview ? (
            <p className="text-muted-foreground text-sm">
              Stored key: {keyPreview}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={loading} type="submit">
              {provider ? "Save changes" : "Connect provider"}
            </Button>
            <Button
              disabled={syncing || !provider || !readyToSync}
              onClick={handleSync}
              type="button"
              variant="outline"
            >
              {syncing ? "Syncing..." : "Sync now"}
            </Button>
            <Button
              disabled={disconnecting || !provider}
              onClick={handleDisconnect}
              type="button"
              variant="ghost"
            >
              Disconnect
            </Button>
          </div>
        </form>
      </StackCard>

      <StackCard title="Status">
        <div className="grid gap-2 text-muted-foreground text-sm">
          <div>Connected provider: {provider ?? "None"}</div>
          <div>
            Last synced: {lastSyncedAt ? formatDate(lastSyncedAt) : "Never"}
          </div>
          <div>Total insights: {totalInsights}</div>
          <div>
            Latest insight: {lastInsightAt ? formatDate(lastInsightAt) : "—"}
          </div>
        </div>
      </StackCard>

      <StackCard title="Sync history">
        {syncLogs.length === 0 ? (
          <div className="text-muted-foreground text-sm">
            No syncs recorded yet.
          </div>
        ) : (
          <div className="grid gap-2">
            {syncLogs.map((log) => (
              <div
                className="flex flex-wrap items-center gap-2 text-xs"
                key={log.id}
              >
                <Badge variant={statusBadge(log.status)}>{log.status}</Badge>
                <span>{log.provider}</span>
                <span>{log.startedAt}</span>
                {log.finishedAt ? (
                  <span>→ {log.finishedAt}</span>
                ) : (
                  <span>→ Running</span>
                )}
                <span>Insights: {log.insightsIngested}</span>
                {log.error ? (
                  <span className="text-red-600">{log.error}</span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </StackCard>
    </div>
  );
};
