"use client";

import * as React from "react";
import {
  ChevronRight,
  FastForward,
  FlaskConical,
  Gauge,
  GitFork,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { describeCap, type CapEvaluation } from "@/domain/governance";
import type { Profile } from "@/domain/profile";
import { formatDateTime, formatTime } from "@/domain/time";
import {
  OUTCOME_TONE,
  RUN_STATUS_LABEL,
  RUN_STATUS_TONE,
  type RenderedMessage,
  type SimulationStep,
} from "@/simulation/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mono, Separator } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { SimulationController } from "@/hooks/use-simulation";
import { NodeIcon } from "./node-icon";

const OUTCOME_BADGE: Record<string, "positive" | "negative" | "neutral" | "accent"> = OUTCOME_TONE;

export function SimulationPanel({
  controller,
  profiles,
  onClose,
}: {
  controller: SimulationController;
  profiles: Profile[];
  onClose: () => void;
}) {
  const { run } = controller;

  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3.5">
        <span className="flex size-7 items-center justify-center rounded-md bg-accent-soft text-accent">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold tracking-tight">Simulation</p>
          <p className="text-[11px] text-subtle-foreground">
            Nothing is delivered — every action is simulated.
          </p>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close simulation">
          <X />
        </Button>
      </div>

      {run ? (
        <RunView controller={controller} />
      ) : (
        <SetupView controller={controller} profiles={profiles} />
      )}
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

function SetupView({
  controller,
  profiles,
}: {
  controller: SimulationController;
  profiles: Profile[];
}) {
  const {
    profileId,
    setProfileId,
    profile,
    eventName,
    setEventName,
    eventTemplates,
    payloadText,
    setPayloadText,
    payloadError,
    start,
  } = controller;

  return (
    <>
      <div className="scroll-slim flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div className="space-y-1.5">
          <Label>Profile</Label>
          <Select value={profileId} onValueChange={setProfileId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a profile" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Seeded profiles</SelectLabel>
                {profiles.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.firstName} {item.lastName} · {item.loyaltyTier}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {profile ? (
            <div className="mt-2 space-y-2 rounded-lg border border-border bg-surface-muted px-3 py-2.5">
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                {profile.segmentNote}
              </p>
              <div className="flex flex-wrap gap-1">
                <Badge tone={profile.appInstalled ? "positive" : "neutral"}>
                  {profile.appInstalled ? "App installed" : "No app"}
                </Badge>
                <Badge tone={profile.contactability.email === "subscribed" ? "positive" : "negative"}>
                  Email {profile.contactability.email}
                </Badge>
                <Badge tone={profile.contactability.push === "subscribed" ? "positive" : "negative"}>
                  Push {profile.contactability.push}
                </Badge>
                {profile.contactability.globallySuppressed ? (
                  <Badge tone="negative">Suppressed</Badge>
                ) : null}
                {!profile.contactability.hasPushToken ? (
                  <Badge tone="warning">No push token</Badge>
                ) : null}
                <Badge tone={profile.messagesInLast24h >= 3 ? "negative" : "neutral"}>
                  {profile.messagesInLast24h}/3 in 24h
                </Badge>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label>Triggering event</Label>
          <Select value={eventName} onValueChange={setEventName}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an event" />
            </SelectTrigger>
            <SelectContent>
              {eventTemplates.map((template) => (
                <SelectItem key={template.name} value={template.name}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Event payload</Label>
          <Textarea
            value={payloadText}
            onChange={(event) => setPayloadText(event.target.value)}
            rows={12}
            className="scroll-slim font-mono text-[11px] leading-[1.6]"
            spellCheck={false}
          />
          {payloadError ? (
            <p className="text-[11.5px] font-medium text-danger">{payloadError}</p>
          ) : (
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Edit the payload to change the path — flipping{" "}
              <Mono>purchaseCompleted</Mono> or a fixture date changes what the journey decides.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-border p-3">
        <Button className="w-full" onClick={start} disabled={!profileId || !eventName}>
          <Play /> Run simulation
        </Button>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Run                                                                        */
/* -------------------------------------------------------------------------- */

function RunView({ controller }: { controller: SimulationController }) {
  const { run, revealedSteps, cursor, atEnd, step, continueAll, restart, reset } = controller;
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const container = scrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [cursor]);

  if (!run) return null;

  const totalSteps = run.steps.length;
  const virtualNow = revealedSteps.at(-1)?.virtualTime ?? run.startedAt;

  return (
    <>
      <div className="border-b border-border bg-surface-muted px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-medium">{run.profileName}</p>
            <p className="truncate font-mono text-[10.5px] text-subtle-foreground">
              {run.eventName}
            </p>
          </div>
          <Badge tone={RUN_STATUS_TONE[run.status]}>{RUN_STATUS_LABEL[run.status]}</Badge>
        </div>

        {run.assignment ? (
          <div className="mt-2 space-y-1.5 rounded-md border border-border bg-surface px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <FlaskConical className="size-3.5 shrink-0" />
                <span className="truncate">{run.assignment.variantName}</span>
              </span>
              <span className="tnum shrink-0 font-mono text-[10.5px] text-subtle-foreground">
                bucket {run.assignment.bucket}
              </span>
            </div>
            <p className="truncate text-[10.5px] text-subtle-foreground">
              {run.assignment.experimentName}
            </p>
            {run.delegatedTo ? (
              <p className="flex items-center gap-1.5 border-t border-border pt-1.5 text-[11px] text-accent">
                <GitFork className="size-3 shrink-0" />
                Running {run.delegatedTo.journeyName} v{run.delegatedTo.version}
              </p>
            ) : null}
          </div>
        ) : null}

        <Separator className="my-2.5" />

        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-subtle-foreground">
            Virtual time
          </span>
          <span className="tnum font-mono text-[11.5px] text-foreground">
            {formatDateTime(virtualNow)}
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-subtle-foreground">Step</span>
          <span className="tnum font-mono text-[11.5px] text-foreground">
            {cursor + 1} / {totalSteps}
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${totalSteps === 0 ? 0 : ((cursor + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      <div ref={scrollRef} className="scroll-slim flex-1 overflow-y-auto px-4 py-4">
        <ol className="relative space-y-0">
          {revealedSteps.map((item, index) => (
            <React.Fragment key={item.id}>
              {/* A run can cross into a fork journey — mark the boundary. */}
              {index > 0 && item.journeyId !== revealedSteps[index - 1].journeyId ? (
                <li className="flex items-center gap-2 py-2 pl-1">
                  <GitFork className="size-3 shrink-0 text-accent" />
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-accent">
                    {item.journeyName}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </li>
              ) : null}
              <TimelineStep
                step={item}
                isLast={index === revealedSteps.length - 1}
                isLatest={index === revealedSteps.length - 1}
              />
            </React.Fragment>
          ))}
        </ol>

        {atEnd ? (
          <div className="mt-4 rounded-lg border border-border bg-surface-muted px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle-foreground">
              Outcome
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-foreground">{run.summary}</p>
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              {run.messages.length} message{run.messages.length === 1 ? "" : "s"} simulated ·
              finished at {formatDateTime(run.endedAt)}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-3">
        <Button variant="secondary" size="sm" onClick={restart} aria-label="Restart">
          <RotateCcw /> Restart
        </Button>
        <Button variant="secondary" size="sm" onClick={step} disabled={atEnd} className="flex-1">
          <ChevronRight /> Step
        </Button>
        <Button size="sm" onClick={continueAll} disabled={atEnd} className="flex-1">
          <FastForward /> Continue
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={reset} aria-label="New simulation">
          <X />
        </Button>
      </div>
    </>
  );
}

function TimelineStep({
  step,
  isLast,
  isLatest,
}: {
  step: SimulationStep;
  isLast: boolean;
  isLatest: boolean;
}) {
  const tone = OUTCOME_BADGE[step.outcome] ?? "neutral";

  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!isLast ? (
        <span aria-hidden className="absolute left-[13px] top-7 bottom-0 w-px bg-border" />
      ) : null}

      <span
        className={cn(
          "relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-surface [&_svg]:size-3.5",
          isLatest ? "border-accent text-accent ring-4 ring-ring/15" : "border-border text-subtle-foreground",
        )}
      >
        <NodeIcon kind={step.nodeKind} />
      </span>

      <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[12.5px] font-medium leading-5">{step.title}</p>
          <span className="tnum shrink-0 font-mono text-[10.5px] text-subtle-foreground">
            {formatTime(step.virtualTime)}
          </span>
        </div>

        <p className="truncate text-[11px] text-muted-foreground">{step.nodeLabel}</p>

        {step.detail ? (
          <p className="break-words rounded border border-border bg-surface-muted px-2 py-1 font-mono text-[11px] leading-4">
            {step.detail}
          </p>
        ) : null}

        <Badge tone={tone}>{step.outcome}</Badge>

        {step.explanation ? (
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">{step.explanation}</p>
        ) : null}

        {step.policy && !step.policy.allowed ? (
          <p
            className={cn(
              "flex items-start gap-1.5 rounded-md px-2 py-1.5 text-[11px] leading-relaxed",
              // A holdout is a measurement decision, not a failure — tone it down.
              step.policy.code === "CONTROL_HOLDBACK"
                ? "bg-surface-muted text-muted-foreground"
                : "bg-danger-soft text-danger",
            )}
          >
            <ShieldAlert className="mt-px size-3.5 shrink-0" />
            <span>
              <span className="font-mono font-semibold">{step.policy.code}</span> — {step.policy.reason}
            </span>
          </p>
        ) : null}

        {step.cap ? <CapTrace cap={step.cap} /> : null}

        {step.message ? <MessagePreview message={step.message} /> : null}
      </div>
    </li>
  );
}

/**
 * Shows how the governed cap was reached. Every rule considered is listed, not
 * just the winner — "why was this blocked?" is the first question asked.
 */
function CapTrace({ cap }: { cap: CapEvaluation }) {
  const [open, setOpen] = React.useState(false);
  const matched = cap.considered.filter((rule) => rule.matched);

  return (
    <div className="rounded-md border border-border bg-surface-muted px-2.5 py-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <Gauge className="size-3.5 shrink-0 text-subtle-foreground" />
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {describeCap(cap.maxMessages, cap.windowDays)} via {cap.sourceName}
        </span>
        <ChevronRight
          className={cn(
            "size-3 shrink-0 text-subtle-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </button>

      {open ? (
        <div className="mt-2 space-y-1.5 border-t border-border pt-2">
          <p className="text-[11px] leading-relaxed text-muted-foreground">{cap.summary}</p>
          <p className="text-[10px] uppercase tracking-wider text-subtle-foreground">
            {matched.length} of {cap.considered.length} rules matched
          </p>
          {cap.considered.map((rule) => (
            <div key={rule.ruleId} className="flex items-start gap-1.5 text-[10.5px] leading-4">
              <span
                className={cn(
                  "mt-1 size-1.5 shrink-0 rounded-full",
                  rule.applied
                    ? "bg-accent"
                    : rule.matched
                      ? "bg-success"
                      : "bg-border-strong",
                )}
              />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    rule.applied ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {rule.ruleName}
                </span>{" "}
                <span className="text-subtle-foreground">{rule.detail}</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MessagePreview({ message }: { message: RenderedMessage }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-muted px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-subtle-foreground">
          {message.channel} · {message.template}
        </span>
      </div>

      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-wider text-subtle-foreground">Template</p>
        <p className="break-words font-mono text-[10.5px] leading-4 text-muted-foreground">
          {message.subjectTemplate}
        </p>
        <p className="break-words font-mono text-[10.5px] leading-4 text-muted-foreground">
          {message.bodyTemplate}
        </p>
      </div>

      <div className="space-y-1 border-t border-border pt-1.5">
        <p className="text-[10px] uppercase tracking-wider text-accent">Rendered</p>
        <p className="break-words text-[11.5px] font-medium leading-4 text-foreground">
          {message.subjectRendered}
        </p>
        <p className="break-words text-[11.5px] leading-4 text-foreground">
          {message.bodyRendered}
        </p>
      </div>

      {message.unresolved.length > 0 ? (
        <p className="text-[10.5px] leading-relaxed text-warning">
          Unresolved: {message.unresolved.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
