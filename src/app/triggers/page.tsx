"use client";

import * as React from "react";
import {
  CalendarClock,
  ChevronRight,
  Clock,
  Plus,
  Play,
  RotateCcw,
  Save,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  createPayloadField,
  createScheduledTrigger,
  createTriggerCondition,
  describeOffset,
  OFFSET_UNIT_LABEL,
  type OffsetUnit,
  type ScheduledTrigger,
  type TriggerEvaluation,
  type TriggerStatus,
} from "@/domain/scheduled-trigger";
import {
  CONDITION_OPERATOR_LABELS,
  UNARY_OPERATORS,
  type ConditionOperator,
} from "@/domain/journey";
import { fullName } from "@/domain/profile";
import { formatDateTime } from "@/domain/time";
import { useAllProfiles } from "@/hooks/use-data";
import {
  allTriggersSync,
  previewTriggers,
  removeTrigger,
  resetFiredLedger,
  runDueTriggers,
  saveTrigger,
} from "@/services/scheduled-triggers";
import { appendEvents, applyProfileTags } from "@/services/local-store";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mono, Separator, Switch } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<TriggerStatus, "positive" | "neutral" | "outline" | "warning" | "negative"> = {
  due: "positive",
  missed: "negative",
  scheduled: "neutral",
  already_fired: "outline",
  ineligible: "warning",
  no_anchor: "outline",
  disabled: "outline",
};

const STATUS_LABEL: Record<TriggerStatus, string> = {
  due: "Due now",
  missed: "Missed",
  scheduled: "Scheduled",
  already_fired: "Already sent",
  ineligible: "Not eligible",
  no_anchor: "No date",
  disabled: "Off",
};

/**
 * Scheduled triggers: date-relative rules that emit events.
 *
 * There is no background scheduler in this PoC, so "Run due triggers" is the
 * manual stand-in for the cron job a deployed version would run. The evaluation
 * it performs is the real thing — only the clock is missing.
 */
export default function TriggersPage() {
  const { profiles } = useAllProfiles();
  const [triggers, setTriggers] = React.useState<ScheduledTrigger[]>(() => allTriggersSync());
  const [nonce, setNonce] = React.useState(0);

  const evaluations = React.useMemo<TriggerEvaluation[]>(
    () => (profiles.length ? previewTriggers(profiles) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profiles, triggers, nonce],
  );

  const dueCount = evaluations.filter((item) => item.status === "due").length;

  const fireDue = () => {
    const result = runDueTriggers(profiles);
    if (result.events.length === 0) {
      toast.info("Nothing due", { description: "No trigger matched a client right now." });
      setNonce((value) => value + 1);
      return;
    }
    appendEvents(result.events);
    applyProfileTags(result.taggedProfileIds);
    setNonce((value) => value + 1);
    toast.success(`${result.events.length} event${result.events.length === 1 ? "" : "s"} emitted`, {
      description:
        "They are in the event log now — open a countdown journey and simulate it to see what each client receives.",
    });
  };

  const update = (next: ScheduledTrigger) => {
    saveTrigger(next);
    setTriggers(allTriggersSync());
  };

  return (
    <>
      <PageHeader
        title="Scheduled triggers"
        description="Date-relative rules that emit an event when they come true. Journeys listen for the event, so the schedule and the message stay separate."
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                resetFiredLedger();
                setNonce((value) => value + 1);
                toast.info("Sent history cleared — everything can fire again.");
              }}
            >
              <RotateCcw /> Reset sent history
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const trigger = createScheduledTrigger();
                update(trigger);
                toast.success("Trigger created — it starts switched off.");
              }}
            >
              <Plus /> New trigger
            </Button>
            <Button size="sm" onClick={fireDue} disabled={dueCount === 0}>
              <Play /> Run due triggers{dueCount > 0 ? ` (${dueCount})` : ""}
            </Button>
          </>
        }
      />

      <PageBody className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-3">
          {triggers.map((trigger) => (
            <TriggerCard
              key={`${trigger.id}:${trigger.enabled}:${trigger.eventName}`}
              trigger={trigger}
              onChange={update}
              onRemove={() => {
                removeTrigger(trigger.id);
                setTriggers(allTriggersSync());
                toast.success("Trigger deleted");
              }}
            />
          ))}
        </div>

        <Card className="h-fit xl:sticky xl:top-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4 text-subtle-foreground" />
              What happens next
            </CardTitle>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Every trigger evaluated against every client, right now.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {triggers.map((trigger) => {
              const rows = evaluations
                .filter((item) => item.triggerId === trigger.id)
                .sort((a, b) => (a.fireAt?.getTime() ?? Infinity) - (b.fireAt?.getTime() ?? Infinity));
              const relevant = rows.filter(
                (row) => row.status === "due" || row.status === "scheduled",
              );

              return (
                <div key={trigger.id} className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle-foreground">
                    {trigger.name}
                  </p>
                  {relevant.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground">
                      Nothing upcoming for this trigger.
                    </p>
                  ) : (
                    relevant.slice(0, 4).map((row) => {
                      const profile = profiles.find((item) => item.id === row.profileId);
                      return (
                        <div
                          key={`${row.triggerId}:${row.profileId}`}
                          className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5"
                        >
                          <span className="min-w-0 truncate text-[12.5px]">
                            {profile ? fullName(profile) : row.profileId}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-[10.5px] text-subtle-foreground">
                              {row.fireAt ? formatDateTime(row.fireAt.toISOString()) : "—"}
                            </span>
                            <Badge tone={STATUS_TONE[row.status]}>
                              {STATUS_LABEL[row.status]}
                            </Badge>
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}

function TriggerCard({
  trigger,
  onChange,
  onRemove,
}: {
  trigger: ScheduledTrigger;
  onChange: (next: ScheduledTrigger) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  // Keyed on the saved trigger, so a save from elsewhere remounts the editor
  // with fresh values rather than syncing state inside an effect.
  const [draft, setDraft] = React.useState(trigger);

  const dirty = JSON.stringify(draft) !== JSON.stringify(trigger);
  const patch = (partial: Partial<ScheduledTrigger>) =>
    setDraft((current) => ({ ...current, ...partial }));

  return (
    <Card className={cn(!trigger.enabled && "opacity-70")}>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Clock className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold tracking-tight">{trigger.name}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              {describeOffset(trigger.offsetValue, trigger.offsetUnit)}{" "}
              <Mono className="text-[11px]">{trigger.anchorField}</Mono> → emits{" "}
              <Mono className="text-[11px]">{trigger.eventName}</Mono>
            </p>
          </div>
          <Switch
            checked={trigger.enabled}
            onCheckedChange={(enabled) => onChange({ ...trigger, enabled })}
            aria-label="Enable trigger"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen((value) => !value)}
            aria-label="Edit trigger"
          >
            <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
          </Button>
        </div>

        {trigger.description ? (
          <p className="pl-10 text-[12px] leading-relaxed text-muted-foreground">
            {trigger.description}
          </p>
        ) : null}

        {open ? (
          <>
            <Separator />

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Anchor date field</Label>
                  <Input
                    value={draft.anchorField}
                    className="font-mono text-[12px]"
                    onChange={(e) => patch({ anchorField: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input
                  value={draft.description ?? ""}
                  placeholder="Why does this exist?"
                  onChange={(e) => patch({ description: e.target.value })}
                />
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div className="w-24 space-y-1.5">
                  <Label>Offset</Label>
                  <Input
                    type="number"
                    value={draft.offsetValue}
                    onChange={(e) => patch({ offsetValue: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="w-32 space-y-1.5">
                  <Label>Unit</Label>
                  <Select
                    value={draft.offsetUnit}
                    onValueChange={(value) => patch({ offsetUnit: value as OffsetUnit })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(OFFSET_UNIT_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="pb-2 text-[12.5px] text-muted-foreground">
                  = {describeOffset(draft.offsetValue, draft.offsetUnit)} the anchor. Negative is
                  before.
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Only when</Label>
                {draft.conditions.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">
                    No conditions — applies to every client with that date.
                  </p>
                ) : null}
                {draft.conditions.map((condition) => (
                  <div key={condition.id} className="flex flex-wrap items-center gap-2">
                    <Input
                      value={condition.field}
                      className="h-8 w-52 font-mono text-[12px]"
                      onChange={(e) =>
                        patch({
                          conditions: draft.conditions.map((item) =>
                            item.id === condition.id ? { ...item, field: e.target.value } : item,
                          ),
                        })
                      }
                    />
                    <Select
                      value={condition.operator}
                      onValueChange={(value) =>
                        patch({
                          conditions: draft.conditions.map((item) =>
                            item.id === condition.id
                              ? { ...item, operator: value as ConditionOperator }
                              : item,
                          ),
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-40 text-[12.5px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CONDITION_OPERATOR_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {UNARY_OPERATORS.includes(condition.operator) ? null : (
                      <Input
                        value={condition.value}
                        className="h-8 w-32 font-mono text-[12px]"
                        onChange={(e) =>
                          patch({
                            conditions: draft.conditions.map((item) =>
                              item.id === condition.id ? { ...item, value: e.target.value } : item,
                            ),
                          })
                        }
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Remove condition"
                      onClick={() =>
                        patch({
                          conditions: draft.conditions.filter((item) => item.id !== condition.id),
                        })
                      }
                    >
                      <Trash2 className="text-danger" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    patch({ conditions: [...draft.conditions, createTriggerCondition()] })
                  }
                >
                  <Plus /> Add condition
                </Button>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="size-3.5 text-accent" />
                  <Label>Then emit this event</Label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Event name</Label>
                    <Input
                      value={draft.eventName}
                      className="font-mono text-[12px]"
                      onChange={(e) => patch({ eventName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>And tag the client (optional)</Label>
                    <Input
                      value={draft.addTag ?? ""}
                      placeholder="e.g. countdown-3m"
                      onChange={(e) => patch({ addTag: e.target.value || undefined })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Payload</Label>
                  {draft.payload.map((field) => (
                    <div key={field.id} className="flex items-center gap-2">
                      <Input
                        value={field.key}
                        placeholder="key"
                        className="h-8 w-40 font-mono text-[12px]"
                        onChange={(e) =>
                          patch({
                            payload: draft.payload.map((item) =>
                              item.id === field.id ? { ...item, key: e.target.value } : item,
                            ),
                          })
                        }
                      />
                      <Input
                        value={field.value}
                        placeholder="value or {{profile.x}}"
                        className="h-8 flex-1 font-mono text-[12px]"
                        onChange={(e) =>
                          patch({
                            payload: draft.payload.map((item) =>
                              item.id === field.id ? { ...item, value: e.target.value } : item,
                            ),
                          })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Remove field"
                        onClick={() =>
                          patch({ payload: draft.payload.filter((item) => item.id !== field.id) })
                        }
                      >
                        <Trash2 className="text-danger" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => patch({ payload: [...draft.payload, createPayloadField()] })}
                  >
                    <Plus /> Add field
                  </Button>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Use <Mono className="text-[10.5px]">{"{{profile.venue}}"}</Mono> for client
                    fields, or <Mono className="text-[10.5px]">{"{{trigger.daysUntilAnchor}}"}</Mono>{" "}
                    and <Mono className="text-[10.5px]">{"{{trigger.anchorDateShort}}"}</Mono> for
                    the dates that caused the event.
                  </p>
                </div>
              </div>

              <div className="flex justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={onRemove}>
                  <Trash2 className="text-danger" /> Delete
                </Button>
                <Button size="sm" disabled={!dirty} onClick={() => onChange(draft)}>
                  <Save /> {dirty ? "Save changes" : "Saved"}
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
