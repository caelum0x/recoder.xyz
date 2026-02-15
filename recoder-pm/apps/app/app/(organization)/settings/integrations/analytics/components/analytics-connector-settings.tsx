"use client";

import { Input } from "@repo/design-system/components/precomposed/input";
import { StackCard } from "@repo/design-system/components/stack-card";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  type AnalyticsProvider,
  deleteAnalyticsConnector,
  syncAnalyticsConnector,
  upsertAnalyticsConnector,
} from "@/actions/analytics/connectors";

type ConnectorLog = {
  readonly id: string;
  readonly status: string;
  readonly eventsIngested: number;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly error: string | null;
};

type ConnectorState = {
  readonly provider: AnalyticsProvider;
  readonly status: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly projectId: string;
  readonly lastSyncedAt: string | null;
  readonly keyPreview: string | null;
  readonly eventsCount: number;
  readonly lastEventAt: string | null;
  readonly logs: ConnectorLog[];
};

type AnalyticsConnectorSettingsProps = {
  readonly connectors: ConnectorState[];
};

const providers: {
  readonly provider: AnalyticsProvider;
  readonly title: string;
  readonly description: string;
  readonly docsUrl: string;
  readonly keyHelp: string;
  readonly projectHelp?: string;
}[] = [
  {
    provider: "MIXPANEL",
    title: "Mixpanel",
    description: "Import events via Mixpanel Export API.",
    docsUrl: "https://developer.mixpanel.com/reference/export",
    keyHelp: "Use a Project Secret from Project Settings → Access Keys.",
  },
  {
    provider: "AMPLITUDE",
    title: "Amplitude",
    description: "Import events via Amplitude Export API.",
    docsUrl: "https://developers.amplitude.com/docs/export-api",
    keyHelp: "Use a Secret Key from Project Settings → API Keys.",
    projectHelp: "API Key is required alongside the secret.",
  },
  {
    provider: "POSTHOG",
    title: "PostHog",
    description: "Import events via PostHog Events API.",
    docsUrl: "https://posthog.com/docs/api/events",
    keyHelp: "Use a Personal API Key with event read access.",
    projectHelp: "Project ID is listed in Project Settings.",
  },
];

const statusBadge = (status: string) => {
  if (status === "SUCCESS") {
    return "default" as const;
  }
  if (status === "ERROR") {
    return "destructive" as const;
  }
  return "secondary" as const;
};

const getBaseUrlPlaceholder = (provider: AnalyticsProvider): string => {
  if (provider === "POSTHOG") {
    return "https://app.posthog.com";
  }
  if (provider === "AMPLITUDE") {
    return "https://amplitude.com/api/2/export";
  }
  return "https://data.mixpanel.com/api/2.0/export";
};

const getConnectorPayload = ({
  provider,
  baseUrl,
  apiKey,
  apiSecret,
  projectId,
}: {
  provider: AnalyticsProvider;
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  projectId: string;
}) => {
  const isAmplitude = provider === "AMPLITUDE";
  const isPosthog = provider === "POSTHOG";
  return {
    provider,
    baseUrl: baseUrl.trim() || undefined,
    apiKey: isAmplitude ? apiKey : apiSecret,
    apiSecret: isAmplitude ? apiSecret : undefined,
    projectId: isPosthog ? projectId : undefined,
  };
};

const throwIfActionError = (response: { error?: string }) => {
  if ("error" in response && response.error) {
    throw new Error(response.error);
  }
};

const ProviderForm = ({
  provider,
  title,
  description,
  docsUrl,
  keyHelp,
  projectHelp,
  connector,
}: {
  readonly provider: AnalyticsProvider;
  readonly title: string;
  readonly description: string;
  readonly docsUrl: string;
  readonly keyHelp: string;
  readonly projectHelp?: string;
  readonly connector?: ConnectorState;
}) => {
  const [baseUrl, setBaseUrl] = useState(connector?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState(connector?.apiKey ?? "");
  const [apiSecret, setApiSecret] = useState("");
  const [projectId, setProjectId] = useState(connector?.projectId ?? "");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isAmplitude = provider === "AMPLITUDE";
  const isPosthog = provider === "POSTHOG";

  const runAction = useCallback(
    async (
      setPending: (pending: boolean) => void,
      action: () => Promise<{ error?: string }>,
      successMessage: string
    ) => {
      setPending(true);
      try {
        const response = await action();
        throwIfActionError(response);
        toast.success(successMessage);
      } catch (error) {
        handleError(error);
      } finally {
        setPending(false);
      }
    },
    []
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runAction(
      setLoading,
      () =>
        upsertAnalyticsConnector(
          getConnectorPayload({
            provider,
            baseUrl,
            apiKey,
            apiSecret,
            projectId,
          })
        ),
      connector ? "Connector updated." : "Connector connected."
    );
    setApiSecret("");
  };

  const handleSync = async () => {
    await runAction(
      setSyncing,
      () => syncAnalyticsConnector(provider),
      "Sync started."
    );
  };

  const handleDelete = async () => {
    await runAction(
      setDeleting,
      () => deleteAnalyticsConnector(provider),
      "Connector disconnected."
    );
  };

  const baseUrlPlaceholder = getBaseUrlPlaceholder(provider);

  const logs = connector?.logs ?? [];
  const requiresSecret = !isAmplitude;
  const hasSecret = Boolean(connector?.keyPreview) || Boolean(apiSecret.trim());
  const hasApiKey = !isAmplitude || Boolean(apiKey.trim());
  const hasProjectId = !isPosthog || Boolean(projectId.trim());
  const isReady = Boolean(connector) && hasSecret && hasApiKey && hasProjectId;
  const showMissing =
    Boolean(connector) && !(hasSecret && hasApiKey && hasProjectId);

  return (
    <StackCard title={title}>
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div>
          <p className="m-0 text-muted-foreground text-sm">{description}</p>
          <div className="mt-2 text-muted-foreground text-xs">
            <a
              className="text-primary"
              href={docsUrl}
              rel="noreferrer"
              target="_blank"
            >
              View provider docs →
            </a>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
            <span>Status:</span>
            <Badge variant="secondary">
              {connector?.status ?? "Not connected"}
            </Badge>
            {connector ? (
              <Badge variant={isReady ? "default" : "secondary"}>
                {isReady ? "Ready to sync" : "Needs setup"}
              </Badge>
            ) : null}
            {connector?.lastSyncedAt ? (
              <span>Last synced {connector.lastSyncedAt}</span>
            ) : null}
            {connector ? <span>Events: {connector.eventsCount}</span> : null}
            {connector?.lastEventAt ? (
              <span>Latest event {connector.lastEventAt}</span>
            ) : null}
          </div>
          {showMissing ? (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-xs">
              Missing required settings:
              <ul className="mt-1 list-disc pl-4">
                {hasSecret ? null : (
                  <li>{requiresSecret ? "API key/secret" : "API secret"}</li>
                )}
                {hasApiKey ? null : <li>API key</li>}
                {hasProjectId ? null : <li>Project ID</li>}
              </ul>
            </div>
          ) : null}
        </div>

        {isPosthog ? (
          <div className="grid gap-2">
            <Input
              className="bg-background"
              label="Project ID"
              onChangeText={setProjectId}
              placeholder="1"
              value={projectId}
            />
            {projectHelp ? (
              <p className="text-muted-foreground text-xs">{projectHelp}</p>
            ) : null}
          </div>
        ) : null}

        {isAmplitude ? (
          <div className="grid gap-2">
            <Input
              className="bg-background"
              label="API Key"
              onChangeText={setApiKey}
              placeholder="amplitude-api-key"
              value={apiKey}
            />
            {projectHelp ? (
              <p className="text-muted-foreground text-xs">{projectHelp}</p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-2">
          <Input
            className="bg-background"
            label={isAmplitude ? "API Secret" : "API Key / Secret"}
            onChangeText={setApiSecret}
            placeholder={isAmplitude ? "amplitude-api-secret" : "api-key"}
            type="password"
            value={apiSecret}
          />
          <p className="text-muted-foreground text-xs">{keyHelp}</p>
        </div>

        <div className="grid gap-2">
          <Input
            className="bg-background"
            label="Base URL (optional)"
            onChangeText={setBaseUrl}
            placeholder={baseUrlPlaceholder}
            value={baseUrl}
          />
          <p className="text-muted-foreground text-xs">
            Use this if you are self-hosting or using a regional endpoint.
          </p>
        </div>

        {connector?.keyPreview ? (
          <p className="text-muted-foreground text-sm">
            Stored key: {connector.keyPreview}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button disabled={loading} type="submit">
            {connector ? "Save changes" : "Connect provider"}
          </Button>
          <Button
            disabled={syncing || !connector || !isReady}
            onClick={handleSync}
            type="button"
            variant="outline"
          >
            {syncing ? "Syncing..." : "Sync now"}
          </Button>
          <Button
            disabled={deleting || !connector}
            onClick={handleDelete}
            type="button"
            variant="ghost"
          >
            Disconnect
          </Button>
        </div>

        {connector ? (
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Sync history
            </div>
            {logs.length === 0 ? (
              <div className="text-muted-foreground text-xs">
                No syncs recorded yet.
              </div>
            ) : (
              <div className="grid gap-2">
                {logs.slice(0, 5).map((log) => (
                  <div
                    className="flex flex-wrap items-center gap-2 text-xs"
                    key={log.id}
                  >
                    <Badge variant={statusBadge(log.status)}>
                      {log.status}
                    </Badge>
                    <span>{log.startedAt}</span>
                    {log.finishedAt ? (
                      <span>→ {log.finishedAt}</span>
                    ) : (
                      <span>→ Running</span>
                    )}
                    <span>Events: {log.eventsIngested}</span>
                    {log.error ? (
                      <span className="text-red-600">{log.error}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </form>
    </StackCard>
  );
};

export const AnalyticsConnectorSettings = ({
  connectors,
}: AnalyticsConnectorSettingsProps) => {
  const connectorMap = new Map(
    connectors.map((connector) => [connector.provider, connector])
  );

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="m-0 font-semibold text-4xl tracking-tight">
          Product Analytics
        </h1>
        <p className="mb-0 text-muted-foreground">
          Connect your product analytics provider and sync usage events.
        </p>
      </div>

      <div className="grid gap-6">
        {providers.map((provider) => (
          <ProviderForm
            connector={connectorMap.get(provider.provider)}
            description={provider.description}
            docsUrl={provider.docsUrl}
            key={provider.provider}
            keyHelp={provider.keyHelp}
            projectHelp={provider.projectHelp}
            provider={provider.provider}
            title={provider.title}
          />
        ))}
      </div>
    </div>
  );
};
