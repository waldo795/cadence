"use client";

import * as React from "react";
import { Activity } from "lucide-react";
import { formatDateTime } from "@/domain/time";
import { useRecentEvents } from "@/hooks/use-data";
import { getEventTemplates } from "@/services/local-store";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mono, Skeleton } from "@/components/ui/misc";

export default function EventsPage() {
  const { events, loading } = useRecentEvents(20);
  const templates = React.useMemo(() => getEventTemplates(), []);

  return (
    <>
      <PageHeader
        title="Events"
        description="The event schema journeys are triggered by. A full event stream browser, schema registry and live tail are planned."
        actions={<Badge tone="outline">Preview</Badge>}
      />

      <PageBody className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Event types</CardTitle>
            <p className="text-[12px] text-muted-foreground">
              Registered schemas available to journey triggers
            </p>
          </CardHeader>
          <CardContent className="space-y-2 pt-1">
            {templates.map((template) => (
              <div key={template.name} className="rounded-lg border border-border px-3 py-2.5">
                <Mono>{template.name}</Mono>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                  {template.description}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent events</CardTitle>
            <p className="text-[12px] text-muted-foreground">
              Seeded activity across the demo customer base
            </p>
          </CardHeader>
          <CardContent className="pt-1">
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((index) => (
                  <Skeleton key={index} className="h-11 rounded-lg" />
                ))}
              </div>
            ) : (
              <ol className="divide-y divide-border">
                {events.map((event) => (
                  <li key={event.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                    <Activity className="size-3.5 shrink-0 text-subtle-foreground" />
                    <Mono className="shrink-0">{event.name}</Mono>
                    <span className="truncate font-mono text-[11px] text-subtle-foreground">
                      {event.profileId}
                    </span>
                    <span className="ml-auto shrink-0 text-[11.5px] text-subtle-foreground">
                      {formatDateTime(event.occurredAt)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
