import {
  currentMembers,
  currentOrganizationId,
  currentUser,
} from "@repo/backend/auth/utils";
import {
  SidebarInset,
  SidebarProvider,
} from "@repo/design-system/components/ui/sidebar";
import { MAX_FREE_MEMBERS } from "@repo/lib/consts";
import { redirect } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import { MountedOnly } from "@/components/mounted-only";
import { database } from "@/lib/database";
import { AiCopilotChat } from "./insights/components/ai-copilot-chat";
import { Forms } from "./components/forms";
import { Navbar } from "./components/navbar";

type OrganizationLayoutProperties = {
  readonly children: ReactNode;
};

export const dynamic = "force-dynamic";

const OrganizationLayout = async ({
  children,
}: OrganizationLayoutProperties) => {
  const [user, organizationId] = await Promise.all([
    currentUser(),
    currentOrganizationId(),
  ]);

  if (!user) {
    redirect("https://recoder.xyz/auth/signin?redirect=https://pm.recoder.xyz");
  }

  if (!organizationId) {
    redirect("/setup");
  }

  const organization = await database.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    throw new Error("Organization not found");
  }

  if (!organization.polarSubscriptionId) {
    const members = await currentMembers();

    if (members.length > MAX_FREE_MEMBERS) {
      redirect("/upgrade");
    }
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "220px",
        } as CSSProperties
      }
    >
      <MountedOnly>
        <Sidebar organization={organization} user={user} />
      </MountedOnly>
      <SidebarInset className="bg-transparent">
        <div className="flex min-h-screen flex-1 flex-col">
          <MountedOnly>
            <Navbar />
          </MountedOnly>
          {children}
        </div>
      </SidebarInset>
      <Suspense fallback={null}>
        <Forms />
      </Suspense>
      <AiCopilotChat organizationId={organizationId} />
    </SidebarProvider>
  );
};

export default OrganizationLayout;
