"use client";

import type { User } from "@repo/backend/auth";
import { RecoderPmRole } from "@repo/backend/auth";
import type { Organization } from "@repo/backend/prisma/client";
import {
  Sidebar as SidebarComponent,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@repo/design-system/components/ui/sidebar";
// biome-ignore lint/performance/noNamespaceImport: navigation module is designed for namespace access
import * as navigation from "../../lib/navigation";
import { SidebarItem } from "./sidebar-item";

type SidebarProps = {
  readonly user: User;
  readonly organization: Organization;
};

export const Sidebar = ({ user, organization }: SidebarProps) => {
  return (
    <SidebarComponent collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="sr-only text-muted-foreground">
            General
          </SidebarGroupLabel>
          <SidebarMenu>
            {[navigation.home, navigation.activity, navigation.insights].map(
              (item) => (
                <SidebarItem key={item.label} {...item} />
              )
            )}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">
            Plan
          </SidebarGroupLabel>
          <SidebarMenu>
            {[
              navigation.feedback,
              navigation.interviews,
              navigation.initiatives,
              navigation.features,
              navigation.proposals,
            ].map((item) => (
              <SidebarItem key={item.label} {...item} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">
            Agent OS
          </SidebarGroupLabel>
          <SidebarMenu>
            {[navigation.agentApprovals, navigation.memoryCandidates].map(
              (item) => (
                <SidebarItem key={item.label} {...item} />
              )
            )}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">
            Ship
          </SidebarGroupLabel>
          <SidebarMenu>
            {[
              navigation.roadmap,
              navigation.releases,
              navigation.changelog,
            ].map((item) => (
              <SidebarItem key={item.label} {...item} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
        {user.user_metadata.organization_role !== RecoderPmRole.Member && (
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarItem {...navigation.data} />
                {user.user_metadata.organization_role ===
                  RecoderPmRole.Admin && (
                  <SidebarItem {...navigation.settings} />
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </SidebarComponent>
  );
};
