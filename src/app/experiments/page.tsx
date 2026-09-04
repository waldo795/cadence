"use client";

import * as React from "react";
import Link from "next/link";
import { FlaskConical, GitFork, Plus, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import {
  createExperiment,
  describeTreatment,
  EXPERIMENT_STATUS_LABEL,
  EXPERIMENT_STATUS_TONE,
  totalAllocation,
  type Experiment,
} from "@/domain/experiment";
import { formatLift } from "@/domain/experiment-results";
import { formatRelative } from "@/domain/time";
import { resultsFor } from "@/services/experiment-results";
import { experimentRepository } from "@/services/experiments";
import { journeyDirectory } from "@/services/local-store";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, Mono, Skeleton } from "@/components/ui/misc";

/**
 * Experiments are managed here, not inside a journey.
 *
 * Putting a live experience under test is a change to *this* record only — the
 * journey definition is untouched, so nothing has to be republished and no
 * running experience is interrupted.
 */
export default function ExperimentsPage() {
  const [experiments, setExperiments] = React.useState<Experiment[] | null>(null);
  const journeys = React.useMemo(() => journeyDirectory.list(), []);

  React.useEffect(() => {
    void experimentRepository.list().then(setExperiments);
  }, []);

  const create = async (journeyKey: string, journeyName: string) => {
    const experiment = createExperiment(journeyKey, journeyName);
    await experimentRepository.save(experiment);
    setExperiments(await experimentRepository.list());
    toast.success("Experiment created", { description: "Configure its variants, then start it." });
  };

  return (
    <>
      <PageHeader
        title="Experiments"
        description="Test a live journey without editing it. Journeys check for a running experiment when a profile enters and route them accordingly."
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Plus /> New experiment
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Journey to test</DropdownMenuLabel>
              {journeys.map((journey) => (
                <DropdownMenuItem
                  key={journey.key}
                  onSelect={() => void create(journey.key, journey.name)}
                >
                  <FlaskConical /> {journey.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <PageBody className="space-y-3">
        {experiments === null ? (
          <div className="space-y-3">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        ) : experiments.length === 0 ? (
          <EmptyState
            icon={<FlaskConical />}
            title="No experiments yet"
            description="Create one to test a change to a live journey without touching the journey itself."
          />
        ) : (
          experiments.map((experiment) => (
            <ExperimentRow key={experiment.id} experiment={experiment} />
          ))
        )}
      </PageBody>
    </>
  );
}

function ExperimentRow({ experiment }: { experiment: Experiment }) {
  const target = journeyDirectory.resolve(experiment.targetJourneyKey);
  const allocation = totalAllocation(experiment);
  const results = React.useMemo(() => resultsFor(experiment), [experiment]);

  // Only surface a headline number once it is actually supportable.
  const headline = results.variants
    .filter((variant) => variant.stats?.significant)
    .sort((a, b) => (b.stats?.lift ?? 0) - (a.stats?.lift ?? 0))[0];

  return (
    <Link
      href={`/experiments/${experiment.id}`}
      className="block rounded-xl border border-border bg-surface px-5 py-4 transition-colors hover:border-border-strong"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[14px] font-semibold tracking-tight">{experiment.name}</h2>
        <Badge tone={EXPERIMENT_STATUS_TONE[experiment.status]}>
          {EXPERIMENT_STATUS_LABEL[experiment.status]}
        </Badge>
        {allocation !== 100 ? <Badge tone="warning">{allocation}% allocated</Badge> : null}
        {headline?.stats ? (
          <Badge tone="positive">
            <TrendingUp /> {formatLift(headline.stats.lift)} {headline.variantName}
          </Badge>
        ) : results.totalExposures > 0 ? (
          <Badge tone="neutral">{results.totalExposures.toLocaleString()} exposures</Badge>
        ) : null}
      </div>

      {experiment.hypothesis ? (
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          {experiment.hypothesis}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Users className="size-3.5 text-subtle-foreground" />
          Testing{" "}
          {target ? (
            <strong className="font-medium text-foreground">
              {target.name} v{target.version}
            </strong>
          ) : (
            <Mono>{experiment.targetJourneyKey}</Mono>
          )}
        </span>
        <span>
          {experiment.startedAt
            ? `Started ${formatRelative(experiment.startedAt)}`
            : `Created ${formatRelative(experiment.createdAt)}`}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {experiment.variants.map((variant) => (
          <span
            key={variant.id}
            className="flex items-center gap-1.5 rounded-md border border-border bg-surface-muted px-2 py-1 text-[11.5px]"
          >
            {variant.treatment.kind === "journey" ? (
              <GitFork className="size-3 text-accent" />
            ) : null}
            <span className="font-medium">{variant.allocation}%</span>
            <span className="text-muted-foreground">{variant.name}</span>
            <span className="text-subtle-foreground">· {describeTreatment(variant.treatment)}</span>
          </span>
        ))}
      </div>
    </Link>
  );
}
