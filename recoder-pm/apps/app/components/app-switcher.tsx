"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { ArrowUpRight, Grid3X3, Key, Settings, Shield } from "lucide-react";
import { NotificationBell } from "./notification-bell";
import { SubscriptionBadge } from "./subscription-badge";

const currentAppId = "pm";
const apps = [
  {
    id: "web",
    label: "Web",
    description: "AI Workspace",
    href: "https://web.recoder.xyz",
  },
  {
    id: "agency",
    label: "Agency",
    description: "AI Agency Platform",
    href: "https://agency.recoder.xyz",
  },
  {
    id: "pm",
    label: "PM",
    description: "Product Management",
    href: "https://pm.recoder.xyz",
  },
  {
    id: "agents",
    label: "Agents",
    description: "AI Agent IDE",
    href: "https://agents.recoder.xyz",
  },
] as const;

const homeSettingsUrls = {
  main: "https://recoder.xyz/settings",
  security: "https://recoder.xyz/settings/security",
  aiProviders: "https://recoder.xyz/settings/ai-providers",
} as const;

export const AppSwitcher = () => (
  <div className="flex items-center gap-2">
    <SubscriptionBadge />
    <NotificationBell />
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="icon" className="h-8 w-8">
        <Grid3X3 className="h-4 w-4" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-56 p-1">
      {apps.map((app) => {
        const isCurrent = app.id === currentAppId;
        return (
          <a
            key={app.id}
            href={app.href}
            rel="noopener noreferrer"
            className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
              isCurrent
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <div className="flex flex-col">
              <span className="font-medium">{app.label}</span>
              <span className="text-[11px] opacity-60">{app.description}</span>
            </div>
            {!isCurrent && <ArrowUpRight className="h-3 w-3 shrink-0 opacity-40" />}
          </a>
        );
      })}
      <div className="my-1 border-t border-border" />
      <a
        href={homeSettingsUrls.main}
        rel="noopener noreferrer"
        className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        <span className="font-medium">Account Settings</span>
        <Settings className="h-3.5 w-3.5 shrink-0 opacity-50" />
      </a>
      <a
        href={homeSettingsUrls.security}
        rel="noopener noreferrer"
        className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        <span className="font-medium">Security</span>
        <Shield className="h-3.5 w-3.5 shrink-0 opacity-50" />
      </a>
      <a
        href={homeSettingsUrls.aiProviders}
        rel="noopener noreferrer"
        className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        <span className="font-medium">AI Providers</span>
        <Key className="h-3.5 w-3.5 shrink-0 opacity-50" />
      </a>
    </PopoverContent>
  </Popover>
  </div>
);
