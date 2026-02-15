import { StackCard } from "@repo/design-system/components/stack-card";
import { ZendeskInstallationForm } from "./install-form";

export const InstallZendesk = () => (
  <div className="grid gap-6">
    <div className="grid gap-2">
      <h1 className="m-0 font-semibold text-4xl tracking-tight">Zendesk</h1>
      <p className="mb-0 text-muted-foreground">
        Follow the steps below to connect Zendesk and start importing tickets.
      </p>
    </div>

    <StackCard title="1. Create a Zendesk API token">
      <p className="text-muted-foreground text-sm">
        In Zendesk, go to Admin Center → Apps and integrations → APIs and enable
        token access. Generate a new API token.
      </p>
    </StackCard>

    <StackCard title="2. Connect Zendesk">
      <ZendeskInstallationForm />
    </StackCard>
  </div>
);
