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
    label: "IDE",
    description: "AI Web IDE",
    href: "https://recoder.xyz",
    current: false,
  },
  {
    label: "Agency",
    description: "AI Agency Platform",
    href: "https://agency.recoder.xyz",
    current: false,
  },
  {
    label: "PM",
    description: "Product Management",
    href: "https://pm.recoder.xyz",
    current: true,
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
