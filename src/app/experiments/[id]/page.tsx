"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  FlaskConical,
  GitFork,
  Pause,
  Play,
  Plus,
  Save,
  Square,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  assignProfile,
  createVariant,
  EXPERIMENT_STATUS_LABEL,
  EXPERIMENT_STATUS_TONE,
  totalAllocation,
  TOTAL_BUCKETS,
  validateExperiment,
  type Experiment,
  type ExperimentStatus,
  type ExperimentVariant,
  type VariantTreatment,
} from "@/domain/experiment";
import { fullName } from "@/domain/profile";
import { useAllProfiles } from "@/hooks/use-data";
import { experimentRepository } from "@/services/experiments";
import { journeyDirectory, journeyRepository } from "@/services/local-store";
import { ResultsPanel } from "@/components/experiments/results-panel";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, Mono, Separator, Skeleton } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TREATMENT_ORIGINAL = "__original__";
const TREATMENT_HOLDOUT = "__holdout__";

export default function ExperimentEditorPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const router = useRouter();

  const [experiment, setExperiment] = React.useState<Experiment | null | undefined>(undefined);
  const [saved, setSaved] = React.useState("");
  const { profiles } = useAllProfiles();

  const journeys = React.useMemo(() => journeyDirectory.list(), []);
  const knownKeys = React.useMemo(() => journeys.map((journey) => journey.key), [journeys]);

  React.useEffect(() => {
    void experimentRepository.get(id).then((found) => {
      setExperiment(found);
      setSaved(JSON.stringify(found));
    });
  }, [id]);

  if (experiment === undefined) {
    return (
      <PageBody className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </PageBody>
    );
  }

  if (experiment === null) {
    return (
      <PageBody>
        <EmptyState
          icon={<FlaskConical />}
          title="Experiment not found"
          description="It may have been deleted."
          action={
            <Button size="sm" asChild>
              <Link href="/experiments">Back to experiments</Link>
            </Button>
          }
        />
      </PageBody>
    );
  }

  const issues = validateExperiment(experiment, knownKeys);
  const errors = issues.filter((issue) => issue.level === "error");
  const dirty = JSON.stringify(experiment) !== saved;
  const target = journeyDirectory.resolve(experiment.targetJourneyKey);
  const allocation = totalAllocation(experiment);

  const update = (partial: Partial<Experiment>) =>
    setExperiment((current) => (current ? { ...current, ...partial } : current));

  const save = async (next: Experiment = experiment) => {
    await experimentRepository.save(next);
    setExperiment(next);
    setSaved(JSON.stringify(next));
    toast.success("Experiment saved");
  };

  const setStatus = async (status: ExperimentStatus) => {
    if (status === "running" && errors.length > 0) {
      toast.error("Cannot start", { description: "Resolve the errors listed above first." });
      return;
    }
    const next: Experiment = {
      ...experiment,
      status,
      startedAt: status === "running" && !experiment.startedAt
        ? new Date().toISOString()
        : experiment.startedAt,
      endedAt: status === "concluded" ? new Date().toISOString() : undefined,
    };
    await save(next);
    toast.success(
      status === "running"
        ? "Experiment started — journeys will route entrants from now on"
        : `Experiment ${EXPERIMENT_STATUS_LABEL[status].toLowerCase()}`,
    );
  };

  /** Copies the journey under test so a variant can be edited independently. */
  const createFork = async (variantId: string) => {
    if (!target) return;
    const variant = experiment.variants.find((item) => item.id === variantId);
    const fork = await journeyRepository.createExperimentFork(
      target.id,
      `${target.name} · ${variant?.name ?? "Variant"}`,
    );
    if (!fork) return;

    const next: Experiment = {
      ...experiment,
      variants: experiment.variants.map((item) =>
        item.id === variantId
          ? { ...item, treatment: { kind: "journey", journeyKey: fork.key } }
          : item,
      ),
    };
    await save(next);
    toast.success("Variant fork created", {
      description: `"${fork.name}" is a full copy you can edit without touching the live journey.`,
    });
    router.push(`/journeys/${fork.id}`);
  };

  const updateVariant = (variantId: string, partial: Partial<ExperimentVariant>) =>
    update({
      variants: experiment.variants.map((variant) =>
        variant.id === variantId ? { ...variant, ...partial } : variant,
      ),
    });

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            {experiment.name}
            <Badge tone={EXPERIMENT_STATUS_TONE[experiment.status]}>
              {EXPERIMENT_STATUS_LABEL[experiment.status]}
            </Badge>
          </span>
        }
        description="Journeys look this up at runtime. Starting or stopping it changes nothing about the journey definition."
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/experiments">
                <ArrowLeft /> All experiments
              </Link>
            </Button>
            {experiment.status === "running" ? (
              <>
                <Button variant="secondary" size="sm" onClick={() => void setStatus("paused")}>
                  <Pause /> Pause
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void setStatus("concluded")}>
                  <Square /> Conclude
                </Button>
              </>
            ) : experiment.status === "concluded" ? null : (
              <Button size="sm" onClick={() => void setStatus("running")}>
                <Play /> Start
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => void save()} disabled={!dirty}>
              <Save /> {dirty ? "Save" : "Saved"}
            </Button>
          </>
        }
      />

      <PageBody className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {issues.length > 0 ? (
            <div
              className={`space-y-1 rounded-lg border px-3.5 py-3 ${
                errors.length > 0
                  ? "border-danger/30 bg-danger-soft"
                  : "border-warning/30 bg-warning-soft"
              }`}
            >
              {issues.map((issue, index) => (
                <p
                  key={index}
                  className={`flex items-start gap-1.5 text-[12px] leading-relaxed ${
                    issue.level === "error" ? "text-danger" : "text-warning"
                  }`}
                >
                  <AlertTriangle className="mt-px size-3.5 shrink-0" />
                  {issue.message}
                </p>
              ))}
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Setup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="space-y-1.5">
                <Label htmlFor="exp-name">Name</Label>
                <Input
                  id="exp-name"
                  value={experiment.name}
                  onChange={(event) => update({ name: event.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exp-hypothesis">Hypothesis</Label>
                <Textarea
                  id="exp-hypothesis"
                  rows={2}
                  placeholder="What do you expect to happen, and why?"
                  value={experiment.hypothesis ?? ""}
                  onChange={(event) => update({ hypothesis: event.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Journey under test</Label>
                <Select
                  value={experiment.targetJourneyKey || undefined}
                  onValueChange={(value) => update({ targetJourneyKey: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a journey" />
                  </SelectTrigger>
                  <SelectContent>
                    {journeys.map((journey) => (
                      <SelectItem key={journey.key} value={journey.key}>
                        {journey.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {target ? (
                  <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
                    <Mono>{experiment.targetJourneyKey}</Mono> resolves to {target.name} v
                    {target.version}
                    <Button variant="ghost" size="xs" asChild>
                      <Link href={`/journeys/${target.id}`}>
                        Open <ExternalLink />
                      </Link>
                    </Button>
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <ResultsPanel experiment={experiment} profiles={profiles} />

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Variants</CardTitle>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Allocated in order across {TOTAL_BUCKETS.toLocaleString()} buckets. Total{" "}
                  <strong className={allocation === 100 ? "" : "text-warning"}>{allocation}%</strong>
                  .
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  update({
                    variants: [
                      ...experiment.variants,
                      createVariant(`Variant ${String.fromCharCode(64 + experiment.variants.length)}`, 0),
                    ],
                  })
                }
              >
                <Plus /> Add variant
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {experiment.variants.map((variant) => (
                <VariantCard
                  key={variant.id}
                  variant={variant}
                  journeys={journeys.filter((journey) => journey.key !== experiment.targetJourneyKey)}
                  canFork={Boolean(target)}
                  onChange={(partial) => updateVariant(variant.id, partial)}
                  onFork={() => void createFork(variant.id)}
                  onRemove={() =>
                    update({
                      variants: experiment.variants.filter((item) => item.id !== variant.id),
                    })
                  }
                />
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit xl:sticky xl:top-6">
          <CardHeader>
            <CardTitle>Assignment preview</CardTitle>
            <p className="text-[12px] text-muted-foreground">
              Where each seeded profile lands. Derived from the profile id, so it never changes
              between entries.
            </p>
          </CardHeader>
          <CardContent className="space-y-1.5 pt-0">
            {profiles.map((profile) => {
              const assignment = assignProfile(experiment, profile.id);
              const kind = assignment.treatment.kind;
              return (
                <div
                  key={profile.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5"
                >
                  <span className="truncate text-[12.5px]">{fullName(profile)}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tnum font-mono text-[10.5px] text-subtle-foreground">
                      {assignment.bucket}
                    </span>
                    <Badge
                      tone={
                        kind === "holdout" ? "warning" : kind === "journey" ? "accent" : "positive"
                      }
                    >
                      {assignment.variantName}
                    </Badge>
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}

function VariantCard({
  variant,
  journeys,
  canFork,
  onChange,
  onFork,
  onRemove,
}: {
  variant: ExperimentVariant;
  journeys: ReturnType<typeof journeyDirectory.list>;
  canFork: boolean;
  onChange: (partial: Partial<ExperimentVariant>) => void;
  onFork: () => void;
  onRemove: () => void;
}) {
  const treatmentValue =
    variant.treatment.kind === "original"
      ? TREATMENT_ORIGINAL
      : variant.treatment.kind === "holdout"
        ? TREATMENT_HOLDOUT
        : variant.treatment.journeyKey;

  const setTreatment = (value: string) => {
    const treatment: VariantTreatment =
      value === TREATMENT_ORIGINAL
        ? { kind: "original" }
        : value === TREATMENT_HOLDOUT
          ? { kind: "holdout" }
          : { kind: "journey", journeyKey: value };
    onChange({ treatment });
  };

  const forkTarget =
    variant.treatment.kind === "journey"
      ? journeyDirectory.resolve(variant.treatment.journeyKey)
      : null;

  return (
    <div className="space-y-3 rounded-lg border border-border p-3.5">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label>Variant name</Label>
          <Input value={variant.name} onChange={(event) => onChange({ name: event.target.value })} />
        </div>
        <div className="w-24 space-y-1.5">
          <Label>Share (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={variant.allocation}
            onChange={(event) =>
              onChange({ allocation: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })
            }
          />
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove variant">
          <Trash2 className="text-danger" />
        </Button>
      </div>

      <Separator />

      <div className="space-y-1.5">
        <Label>These profiles experience</Label>
        <Select value={treatmentValue} onValueChange={setTreatment}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TREATMENT_ORIGINAL}>The original journey (control)</SelectItem>
            <SelectItem value={TREATMENT_HOLDOUT}>Nothing — hold them out</SelectItem>
            {journeys.map((journey) => (
              <SelectItem key={journey.key} value={journey.key}>
                Fork → {journey.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {variant.treatment.kind === "journey" ? (
          forkTarget ? (
            <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
              Runs <strong className="font-medium text-foreground">{forkTarget.name}</strong> v
              {forkTarget.version} instead.
              <Button variant="ghost" size="xs" asChild>
                <Link href={`/journeys/${forkTarget.id}`}>
                  Edit <ExternalLink />
                </Link>
              </Button>
            </p>
          ) : (
            <p className="text-[11.5px] font-medium text-danger">
              No live journey has that key.
            </p>
          )
        ) : variant.treatment.kind === "holdout" ? (
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            The journey records an entry and an exit stamped with this experiment, but no
            experience runs and nothing is sent.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11.5px] text-muted-foreground">
              Runs the journey exactly as it is today.
            </p>
            {canFork ? (
              <Button variant="secondary" size="xs" onClick={onFork}>
                <GitFork /> Create a fork to edit
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
