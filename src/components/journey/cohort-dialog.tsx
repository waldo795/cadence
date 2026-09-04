"use client";

import * as React from "react";
import { CheckCircle2, ChartNoAxesColumn, TriangleAlert } from "lucide-react";
import type { CustomerEvent, JsonValue } from "@/domain/event";
import type { JourneyDefinition } from "@/domain/journey";
import { fullName, type Profile } from "@/domain/profile";
import { simulationEngine } from "@/simulation/engine";
import type { SimulationRun } from "@/simulation/types";
import {
  getEventTemplates,
  journeyDirectory,
  messageHistoryFor,
  resolveJourneyDefinition,
} from "@/services/local-store";
import { experimentDirectory } from "@/services/experiments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/misc";

interface CohortDialogProps {
  journey: JourneyDefinition;
  profiles: Profile[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CohortRow {
  profile: Profile;
  run: SimulationRun;
  /** A second, independent run used to prove assignment is stable on re-entry. */
  reentryGroup: string;
}

export function CohortDialog(props: CohortDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <CohortDialogBody {...props} />
    </Dialog>
  );
}

function CohortDialogBody({ journey, profiles, onOpenChange }: CohortDialogProps) {
  const rows = React.useMemo<CohortRow[]>(() => {
    const template = getEventTemplates().find((item) => item.name === journey.trigger.name);
    const payload = (template?.samplePayload ?? {}) as Record<string, JsonValue>;

    return profiles.map((profile) => {
      const makeEvent = (id: string): CustomerEvent => ({
        id,
        name: journey.trigger.name,
        profileId: profile.id,
        occurredAt: new Date().toISOString(),
        payload,
      });

      const history = messageHistoryFor(profile.id);
      const options = {
        journey,
        profile,
        messageHistory: history,
        directory: journeyDirectory,
        experiments: experimentDirectory,
        resolveJourney: resolveJourneyDefinition,
      };

      const run = simulationEngine.run({ ...options, event: makeEvent("cohort_1") });
      // Deliberately a *separate* run, as if the profile re-entered later.
      const reentry = simulationEngine.run({ ...options, event: makeEvent("cohort_2") });

      return {
        profile,
        run,
        reentryGroup: reentry.assignment?.variantName ?? "—",
      };
    });
  }, [journey, profiles]);

  const heldOut = rows.filter((row) => row.run.assignment?.treatment.kind === "holdout");
  const forked = rows.filter((row) => row.run.delegatedTo);
  const onOriginal = rows.filter(
    (row) => !row.run.delegatedTo && row.run.assignment?.treatment.kind !== "holdout",
  );
  const sent = rows.reduce((total, row) => total + row.run.messages.length, 0);
  const blocked = rows.reduce(
    (total, row) =>
      total + row.run.steps.filter((step) => step.outcome === "BLOCKED").length,
    0,
  );
  const excluded = rows.filter((row) =>
    row.run.steps.some((step) => step.outcome === "EXCLUDED"),
  ).length;

  // The property that makes a holdout trustworthy: same profile, same group.
  const stickinessHolds = rows.every(
    (row) => (row.run.assignment?.variantName ?? "—") === row.reentryGroup,
  );

  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ChartNoAxesColumn className="size-4 text-accent" />
          Cohort run
        </DialogTitle>
        <DialogDescription>
          Every seeded profile pushed through this journey at once, with each profile run twice to
          confirm repeat entrance resolves to the same group.
        </DialogDescription>
      </DialogHeader>

      <div className="scroll-slim max-h-[62vh] space-y-4 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Ran this journey" value={String(onOriginal.length)} tone="positive" />
          <Stat label="Routed to a fork" value={String(forked.length)} tone="accent" />
          <Stat label="Held out" value={String(heldOut.length)} tone="warning" />
          <Stat label="Messages simulated" value={String(sent)} />
        </div>

        <div
          className={`flex items-start gap-2.5 rounded-lg px-3.5 py-3 ${
            stickinessHolds ? "bg-success-soft" : "bg-danger-soft"
          }`}
        >
          {stickinessHolds ? (
            <CheckCircle2 className="mt-px size-4 shrink-0 text-success" />
          ) : (
            <TriangleAlert className="mt-px size-4 shrink-0 text-danger" />
          )}
          <div className="min-w-0">
            <p
              className={`text-[12.5px] font-medium ${
                stickinessHolds ? "text-success" : "text-danger"
              }`}
            >
              {stickinessHolds
                ? "Re-entry safe — every profile resolved to the same group on the second run."
                : "Assignment drifted between runs. A held-out profile could be contacted."}
            </p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
              {blocked} action{blocked === 1 ? "" : "s"} blocked by consent or contact caps ·{" "}
              {excluded} profile{excluded === 1 ? "" : "s"} suppressed by cross-journey exclusion.
            </p>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          {rows.map(({ profile, run, reentryGroup }) => {
            const kind = run.assignment?.treatment.kind;
            const sticky = (run.assignment?.variantName ?? "—") === reentryGroup;

            return (
              <div key={profile.id} className="rounded-lg border border-border px-3.5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-medium">{fullName(profile)}</p>
                  {run.assignment ? (
                    <Badge
                      tone={
                        kind === "holdout" ? "warning" : kind === "journey" ? "accent" : "positive"
                      }
                    >
                      {run.assignment.variantName}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">No experiment</Badge>
                  )}
                  {run.delegatedTo ? (
                    <Badge tone="outline">→ {run.delegatedTo.journeyName}</Badge>
                  ) : null}
                  <Badge tone={sticky ? "outline" : "negative"}>
                    {sticky ? "re-entry stable" : "re-entry DRIFTED"}
                  </Badge>
                  <span className="ml-auto text-[11.5px] text-subtle-foreground">
                    {run.messages.length} sent
                    {run.withheldMessages.length > 0
                      ? ` · ${run.withheldMessages.length} withheld`
                      : ""}
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                  {run.summary}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <DialogFooter>
        <Button size="sm" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "warning" | "accent";
}) {
  const color =
    tone === "positive"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "accent"
          ? "text-accent"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wider text-subtle-foreground">{label}</p>
      <p className={`tnum mt-1 text-xl font-semibold tracking-tight ${color}`}>{value}</p>
    </div>
  );
}
