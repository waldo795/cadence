"use client";

import * as React from "react";
import { CheckCircle2, Info, Play, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { assignProfile, type Experiment } from "@/domain/experiment";
import {
  formatLift,
  formatRate,
  MIN_CONVERSIONS_PER_ARM,
  MIN_EXPOSURES_PER_ARM,
  type ExperimentResults,
  type VariantResult,
} from "@/domain/experiment-results";
import { formatRelative } from "@/domain/time";
import type { Profile } from "@/domain/profile";
import { baselineNoteFor, recordExposure, resultsFor } from "@/services/experiment-results";
import { journeyDirectory, resolveJourneyDefinition } from "@/services/local-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mono } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Lift reporting.
 *
 * Everything shown is computed from stored exposures plus attributed
 * conversions — nothing is asserted. Where the data is too thin to support a
 * conclusion the panel says so rather than showing a tempting number.
 */
export function ResultsPanel({
  experiment,
  profiles,
}: {
  experiment: Experiment;
  profiles: Profile[];
}) {
  const [nonce, setNonce] = React.useState(0);
  const results = React.useMemo<ExperimentResults>(
    () => resultsFor(experiment),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [experiment, nonce],
  );
  const baselineNote = React.useMemo(
    () => baselineNoteFor(experiment.id),
    [experiment.id],
  );

  /**
   * Pushes the demo profiles through an entry so exposure recording — and its
   * de-duplication — can be seen working.
   */
  const recordCohortEntry = () => {
    const target = journeyDirectory.resolve(experiment.targetJourneyKey);
    const journey = target ? resolveJourneyDefinition(experiment.targetJourneyKey) : null;
    if (!journey) {
      toast.error("Cannot record entries", { description: "The target journey is missing." });
      return;
    }

    let created = 0;
    let repeat = 0;

    for (const profile of profiles) {
      const assignment = assignProfile(experiment, profile.id);
      const outcome = recordExposure(experiment.id, assignment);
      if (outcome.created) created += 1;
      else repeat += 1;
    }

    setNonce((value) => value + 1);
    toast.success(`${created} new exposure${created === 1 ? "" : "s"} recorded`, {
      description:
        repeat > 0
          ? `${repeat} profile${repeat === 1 ? " was" : "s were"} already exposed — their entry count went up, but the denominator did not.`
          : "Run it again to see that re-entry does not double-count.",
    });
  };

  const baseline = results.variants.find((variant) => variant.isBaseline);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>Results</CardTitle>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {results.metric
                ? `Measured on ${results.metric.name} — ${results.metric.eventName} within ${results.metric.attributionWindowDays} days of first exposure.`
                : "No primary metric is set."}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={recordCohortEntry}>
            <Play /> Record cohort entry
          </Button>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          <div
            className={cn(
              "flex items-start gap-2.5 rounded-lg px-3.5 py-3",
              results.readiness === "ready" ? "bg-success-soft" : "bg-surface-muted",
            )}
          >
            {results.readiness === "ready" ? (
              <TrendingUp className="mt-px size-4 shrink-0 text-success" />
            ) : (
              <Info className="mt-px size-4 shrink-0 text-subtle-foreground" />
            )}
            <div className="min-w-0">
              <p
                className={cn(
                  "text-[12.5px] font-medium leading-relaxed",
                  results.readiness === "ready" ? "text-success" : "text-foreground",
                )}
              >
                {results.summary}
              </p>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                {results.totalExposures.toLocaleString()} exposures ·{" "}
                {baseline ? `baseline is "${baseline.variantName}"` : "no baseline"}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th>Variant</Th>
                  <Th align="right">Exposures</Th>
                  <Th align="right">Conversions</Th>
                  <Th align="right">Rate</Th>
                  <Th align="right">Lift</Th>
                  <Th align="right">p</Th>
                </tr>
              </thead>
              <tbody>
                {results.variants.map((variant) => (
                  <VariantRow key={variant.variantId} variant={variant} />
                ))}
              </tbody>
            </table>
          </div>

          {results.readiness === "ready" ? (
            <p className="text-[11px] leading-relaxed text-subtle-foreground">
              Two-proportion z-test at the 95% level, with a 95% interval on the absolute
              difference in conversion rate. A single test on a single metric — repeatedly
              checking a running experiment inflates the false-positive rate, so treat an early
              result as provisional.
            </p>
          ) : (
            <p className="text-[11px] leading-relaxed text-subtle-foreground">
              A comparison needs at least {MIN_EXPOSURES_PER_ARM} exposures and{" "}
              {MIN_CONVERSIONS_PER_ARM} conversions in each arm.
            </p>
          )}

          {baselineNote ? (
            <p className="rounded-md bg-surface-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              {baselineNote} The statistics above are computed from it, not asserted — but the
              volume itself is fabricated for the demo.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-subtle-foreground" />
            Exposure ledger
          </CardTitle>
          <p className="mt-1 text-[12px] text-muted-foreground">
            One row per profile. Re-entry increments the counter — it never adds a row, so the
            denominator counts people rather than visits.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {results.ledger.length === 0 ? (
            <p className="py-2 text-[13px] text-muted-foreground">
              No individual exposures recorded yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {results.ledger.map((exposure) => (
                <div
                  key={`${exposure.experimentId}:${exposure.profileId}`}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2.5 py-1.5"
                >
                  <Mono className="text-[10.5px]">{exposure.profileId}</Mono>
                  <Badge tone="outline">{exposure.variantName}</Badge>
                  <span className="text-[11.5px] text-muted-foreground">
                    first seen {formatRelative(exposure.firstExposedAt)}
                  </span>
                  <Tooltip
                    side="top"
                    content="Entries counted for this profile. Only the first creates an exposure."
                  >
                    <span className="ml-auto tnum rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                      ×{exposure.entryCount}
                    </span>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "pb-2 text-[10px] font-medium uppercase tracking-wider text-subtle-foreground",
        align === "right" && "text-right",
      )}
    >
      {children}
    </th>
  );
}

function VariantRow({ variant }: { variant: VariantResult }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2.5">
        <span className="flex items-center gap-2">
          <span className="font-medium">{variant.variantName}</span>
          {variant.isBaseline ? <Badge tone="neutral">Baseline</Badge> : null}
          {variant.stats?.significant ? (
            <Badge tone="positive">
              <CheckCircle2 /> Significant
            </Badge>
          ) : null}
        </span>
        {variant.note ? (
          <p className="mt-1 max-w-md text-[11px] leading-relaxed text-subtle-foreground">
            {variant.note}
          </p>
        ) : null}
        {variant.stats ? (
          <p className="mt-1 text-[11px] text-subtle-foreground">
            95% CI on the difference: {formatRate(variant.stats.confidenceInterval[0])} to{" "}
            {formatRate(variant.stats.confidenceInterval[1])}
            {variant.stats.confidenceInterval[0] <= 0 &&
            variant.stats.confidenceInterval[1] >= 0
              ? " — spans zero"
              : ""}
          </p>
        ) : null}
      </td>
      <td className="tnum py-2.5 text-right">{variant.exposures.toLocaleString()}</td>
      <td className="tnum py-2.5 text-right">{variant.conversions.toLocaleString()}</td>
      <td className="tnum py-2.5 text-right font-medium">
        {formatRate(variant.conversionRate)}
      </td>
      <td
        className={cn(
          "tnum py-2.5 text-right font-medium",
          variant.stats
            ? variant.stats.lift > 0
              ? "text-success"
              : "text-danger"
            : "text-subtle-foreground",
        )}
      >
        {variant.isBaseline ? "—" : variant.stats ? formatLift(variant.stats.lift) : "—"}
      </td>
      <td className="tnum py-2.5 text-right text-muted-foreground">
        {variant.stats ? variant.stats.pValue.toFixed(4) : "—"}
      </td>
    </tr>
  );
}
