"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CalendarClock,
  FlaskConical,
  UserPlus,
  GitBranch,
  LayoutDashboard,
  LayoutTemplate,
  Lock,
  LogOut,
  Plug,
  Settings,
  ShieldCheck,
  Users,
  Waypoints,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarSendingSummary } from "./sending-controls";
import { ThemeToggle } from "./theme-toggle";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Secondary pages are polished placeholders in this PoC. */
  preview?: boolean;
}

const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: <LayoutDashboard /> },
  { href: "/journeys", label: "Journeys", icon: <GitBranch /> },
  { href: "/profiles", label: "Clients", icon: <Users /> },
  { href: "/instances", label: "Running", icon: <Activity /> },
  { href: "/triggers", label: "Triggers", icon: <CalendarClock /> },
  { href: "/templates", label: "Templates", icon: <LayoutTemplate /> },
  { href: "/signup", label: "Add client", icon: <UserPlus /> },
  { href: "/experiments", label: "Experiments", icon: <FlaskConical /> },
  { href: "/governance", label: "Governance", icon: <ShieldCheck /> },
  { href: "/privacy", label: "Privacy", icon: <Lock /> },
  { href: "/events", label: "Events", icon: <Waypoints />, preview: true },
  { href: "/connections", label: "Connections", icon: <Plug />, preview: true },
  { href: "/settings", label: "Settings", icon: <Settings />, preview: true },
];

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center gap-2.5 px-5">
        <div className="flex size-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Waypoints className="size-4" />
        </div>
        <div className="leading-tight">
          <p className="text-[13px] font-semibold tracking-tight">Cadence</p>
          <p className="text-[10px] uppercase tracking-wider text-subtle-foreground">
            Journey orchestration
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
              "[&_svg]:size-4 [&_svg]:shrink-0",
              isActive(item.href)
                ? "bg-surface-muted text-foreground [&_svg]:text-accent"
                : "text-muted-foreground hover:bg-surface-muted hover:text-foreground [&_svg]:text-subtle-foreground",
            )}
          >
            {item.icon}
            <span className="flex-1">{item.label}</span>
            {item.preview ? (
              <span className="rounded-sm bg-surface-muted px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-subtle-foreground group-hover:bg-background">
                Soon
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <SidebarSendingSummary />
        <div className="flex items-center justify-between pl-1">
          <button
            type="button"
            onClick={() => {
              void fetch("/api/auth", { method: "DELETE" }).then(() => {
                /*
                 * A full reload, not router.push. The hydrated dataset lives in
                 * module-level memory, and a client-side navigation would leave
                 * it there for whoever signs in next.
                 */
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.href = "/login";
              });
            }}
            className="flex items-center gap-2 rounded-md px-1 py-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
