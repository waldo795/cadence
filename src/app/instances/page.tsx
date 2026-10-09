"use client";

import * as React from "react";
import Link from "next/link";
import { Activity, AlertTriangle, Clock, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  describeWake,
  INSTANCE_STATUS_LABEL,
  INSTANCE_STATUS_TONE,
  type InstanceStatus,
  type JourneyInstance,
} from "@/domain/instance";
import { fullName } from "@/domain/profile";
import { formatDateTime } from "@/domain/time";
import { useAllProfiles } from "@/hooks/use-data";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Mono, Skeleton } from "@/components/ui/misc";

interface Payload {
  instances: JourneyInstance[];
  counts: Record<InstanceStatus, number>;
}

/**
 * Live journey instances.
 *
 * This is the first version of the "what is happening and what is coming"
 * view. It reads from the server on each load rather than the hydrated
 * snapshot, because instances change whenever the scheduler runs.
 */
export default function InstancesPage() {
  const [data, setData] = React.useState<Payload | null>(null);
  const [running, setRunning] = React.useState(false);
  const { profiles } = useAllProfiles();

  const nameFor = React.useCallback(
    (profileId: string) => {
      const profile = profiles.find((item) => item.id === profileId);
      return profile ? fullName(profile) : profileId;
    },
    [profiles],
  );

  const load = React.useCallback(() => {
    // State is only set from the promise callback, never synchronously in the
    // effect body.
    void fetch("/api/instances", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: Payload) => setData(payload));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const runScheduler = async () => {
    setRunning(true);
    try {
      const response = await fetch("/api/cron", { method: "POST" });
      const result = (await response.json()) as {
        ok: boolean;
        error?: string;
        triggers?: { emitted: number };
        instances?: { started: number; resumed: number; messages: number };
      };

      if (!result.ok) {
        toast.error("Scheduler failed", { description: result.error });
        return;
      }

      load();
      toast.success("Scheduler run", {
        description: `${result.triggers?.emitted ?? 0} event(s) emitted · ${result.instances?.started ?? 0} journey(s) started · ${result.instances?.resumed ?? 0} resumed · ${result.instances?.messages ?? 0} message(s).`,
      });
    } finally {
      setRunning(false);
    }
  };

  const now = new Date();
  const waiting = data?.instances.filter((item) => item.status === "waiting") ?? [];
  const finished = data?.instances.filter((item) => item.status !== "waiting") ?? [];

  return (
    <>
      <PageHeader
        title="Running journeys"
        description="Every client currently part-way through a journey, and when they resume. This is what the scheduler advances."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              <RefreshCw /> Refresh
            </Button>
            <Button size="sm" onClick={() => void runScheduler()} disabled={running}>
              <Play /> {running ? "Running…" : "Run scheduler"}
            </Button>
          </>
        }
      />

      <PageBody className="space-y-5">
        {data === null ? (
          <div className="space-y-3">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {(Object.keys(INSTANCE_STATUS_LABEL) as InstanceStatus[]).map((status) => (
                <div key={status} className="rounded-lg border border-border px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wider text-subtle-foreground">
                    {INSTANCE_STATUS_LABEL[status]}
                  </p>
                  <p className="tnum mt-1 text-xl font-semibold tracking-tight">
                    {data.counts[status] ?? 0}
                  </p>
                </div>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="size-4 text-subtle-foreground" />
                  Waiting to resume
                </CardTitle>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Parked at a wait. The scheduler picks these up once their time arrives.
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                {waiting.length === 0 ? (
                  <p className="py-2 text-[13px] text-muted-foreground">
                    Nothing is waiting. Start a journey by running the scheduler, or simulate
                    one from a journey page.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {waiting.map((instance) => (
                      <InstanceRow
                        key={instance.id}
                        instance={instance}
                        name={nameFor(instance.profileId)}
                        now={now}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="size-4 text-subtle-foreground" />
                  Recently finished
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {finished.length === 0 ? (
                  <EmptyState
                    icon={<Activity />}
                    title="Nothing has run yet"
                    description="Run the scheduler to start journeys for anyone whose countdown is due."
                  />
                ) : (
                  <div className="space-y-1.5">
                    {finished.slice(0, 20).map((instance) => (
                      <InstanceRow
                        key={instance.id}
                        instance={instance}
                        name={nameFor(instance.profileId)}
                        now={now}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Whether a message is really delivered depends on each journey&apos;s send mode
              and the workspace kill switch. See{" "}
              <Link href="/journeys" className="underline underline-offset-2">
                journeys
              </Link>{" "}
              to change what each one sends.
            </p>
          </>
        )}
      </PageBody>
    </>
  );
}

function InstanceRow({
  instance,
  name,
  now,
}: {
  instance: JourneyInstance;
  name: string;
  now: Date;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{name}</span>
      <span className="truncate text-[12px] text-muted-foreground">
        {instance.journeyName} v{instance.journeyVersion}
      </span>
      <Badge tone={INSTANCE_STATUS_TONE[instance.status]}>
        {INSTANCE_STATUS_LABEL[instance.status]}
      </Badge>
      {instance.wakeAt ? (
        <span className="tnum text-[11.5px] text-subtle-foreground">
          {describeWake(instance, now)} · {formatDateTime(instance.wakeAt)}
        </span>
      ) : null}
      {instance.currentNodeId ? (
        <Mono className="text-[10.5px]">{instance.currentNodeId}</Mono>
      ) : null}
      {instance.lastError ? (
        <span className="flex w-full items-start gap-1.5 text-[11.5px] text-danger">
          <AlertTriangle className="mt-px size-3 shrink-0" />
          {instance.lastError}
        </span>
      ) : null}
    </div>
  );
}
