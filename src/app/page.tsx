"use client";

import * as React from "react";
import Link from "next/link";
import { Activity, ArrowUpRight, GitBranch, Send, Users } from "lucide-react";
import { formatRelative } from "@/domain/time";
import { useJourneys, useRecentEvents } from "@/hooks/use-data";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mono, Skeleton } from "@/components/ui/misc";

/** Headline metrics are illustrative seed values, not derived from local data. */
const METRICS = [
  { label: "Active journeys", value: "12", delta: "+2 this week", icon: <GitBranch /> },
  { label: "Active journey instances", value: "184,291", delta: "+6.4%", icon: <Users /> },
  { label: "Events today", value: "2.8m", delta: "+11.2%", icon: <Activity /> },
  { label: "Simulated messages", value: "128k", delta: "Last 30 days", icon: <Send /> },
];

/** Fourteen days of event volume, shaped to look like a real weekly cycle. */
const VOLUME = [58, 62, 71, 68, 74, 41, 33, 66, 79, 83, 77, 88, 52, 39];

export default function OverviewPage() {
  const { journeys, loading } = useJourneys();
  const { events } = useRecentEvents(6);

  return (
    <>
      <PageHeader
        title="Overview"
        description="A snapshot of orchestration activity across the workspace. All figures are seeded demo data."
        actions={
          <Button size="sm" asChild>
            <Link href="/journeys">
              Open journeys <ArrowUpRight />
            </Link>
          </Button>
        }
      />

      <PageBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {METRICS.map((metric) => (
            <Card key={metric.label}>
              <CardContent className="space-y-2.5 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-muted-foreground">{metric.label}</p>
                  <span className="text-subtle-foreground [&_svg]:size-3.5">{metric.icon}</span>
                </div>
                <p className="tnum text-2xl font-semibold tracking-tight">{metric.value}</p>
                <p className="text-[11.5px] text-subtle-foreground">{metric.delta}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Event volume</CardTitle>
                <p className="text-[12px] text-muted-foreground">Last 14 days · millions of events</p>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Event volume over the last 14 days">
                  {VOLUME.map((value, index) => (
                    <div
                      key={index}
                      className="flex-1 rounded-t-sm bg-accent/70 transition-colors hover:bg-accent"
                      style={{ height: `${value}%` }}
                      title={`Day ${index + 1}: ${(value / 25).toFixed(1)}m events`}
                    />
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[10.5px] text-subtle-foreground">
                  <span>14 days ago</span>
                  <span>Today</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Recent journeys</CardTitle>
                <Button variant="ghost" size="xs" asChild>
                  <Link href="/journeys">View all</Link>
                </Button>
              </CardHeader>
              <CardContent className="pt-1">
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-14 rounded-lg" />
                    <Skeleton className="h-14 rounded-lg" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {journeys.slice(0, 4).map((journey) => (
                      <Link
                        key={journey.id}
                        href={`/journeys/${journey.id}`}
                        className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-3 transition-colors hover:border-border-strong hover:bg-surface-muted"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[13px] font-medium">{journey.name}</p>
                            <Badge tone={journey.status === "published" ? "positive" : "neutral"}>
                              {journey.status === "published" ? "Published" : "Draft"}
                            </Badge>
                            <Badge tone="outline">v{journey.version}</Badge>
                          </div>
                          <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                            <Mono>{journey.trigger.name}</Mono>
                            <span>· updated {formatRelative(journey.updatedAt)}</span>
                          </p>
                        </div>
                        <ArrowUpRight className="size-4 shrink-0 text-subtle-foreground" />
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <p className="text-[12px] text-muted-foreground">Latest events across the workspace</p>
            </CardHeader>
            <CardContent className="pt-1">
              <ol className="space-y-3">
                {events.map((event) => (
                  <li key={event.id} className="flex gap-3">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" />
                    <div className="min-w-0 flex-1">
                      <Mono className="text-[10.5px]">{event.name}</Mono>
                      <p className="mt-1 truncate text-[11.5px] text-subtle-foreground">
                        {formatRelative(event.occurredAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
