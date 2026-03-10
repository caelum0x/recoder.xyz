"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { ArrowUpRightIcon, LayoutGridIcon } from "lucide-react";

const apps = [
  {
    label: "Hub",
    description: "Dashboard & Settings",
    href: "https://recoder.xyz",
    current: false,
  },
  {
    label: "Agents",
    description: "AI Agent IDE",
    href: "https://agents.recoder.xyz",
    current: false,
  },
  {
    label: "Web",
    description: "Web AI IDE",
    href: "https://web.recoder.xyz",
    current: false,
  },
  {
    label: "PM",
    description: "Product Management",
    href: "https://pm.recoder.xyz",
    current: true,
  },
  {
    label: "Agency",
    description: "AI Agent Workflows",
    href: "https://agency.recoder.xyz",
    current: false,
  },
  {
    label: "OpenClaw",
    description: "Open-Source AI Tools",
    href: "https://openclaw.recoder.xyz",
    current: false,
  },
] as const;

export const OrganizationSwitcher = () => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button
        className="flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-muted-foreground text-xs outline-none transition-colors hover:bg-accent hover:text-foreground"
        type="button"
      >
        <LayoutGridIcon className="h-3.5 w-3.5" />
        <span>Apps</span>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-52">
      <DropdownMenuLabel>Recoder Platform</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {apps.map((app) => (
        <DropdownMenuItem asChild disabled={app.current} key={app.label}>
          <a
            className="flex items-center justify-between"
            href={app.href}
            {...(app.current ? {} : { target: "_self" })}
          >
            <div className="flex flex-col">
              <span className="font-medium">{app.label}</span>
              <span className="text-[11px] text-muted-foreground">
                {app.description}
              </span>
            </div>
            {!app.current && (
              <ArrowUpRightIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
          </a>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);
