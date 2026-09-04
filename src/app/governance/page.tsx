"use client";

import * as React from "react";
import { GripVertical, Plus, RotateCcw, Save, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  CEILING_SOURCE_ID,
  createCondition,
  createRule,
  describeCap,
  GOVERNANCE_FIELDS,
  messagesInWindow,
  resolveCap,
  type ContactPolicy,
  type FrequencyRule,
  type RuleChannel,
} from "@/domain/governance";
import {
  CONDITION_OPERATOR_LABELS,
  UNARY_OPERATORS,
  type Channel,
  type ConditionOperator,
} from "@/domain/journey";
import { engagementTierFor, fullName, tenureDays } from "@/domain/profile";
import { useAllProfiles } from "@/hooks/use-data";
import { getContactPolicy, saveContactPolicy } from "@/services/governance";
import { seedContactPolicy } from "@/seed/governance";
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

/**
 * Contact governance is edited here, not inside journeys — one change protects
 * every journey at once. The preview on the right resolves the draft policy
 * against real profiles so the effect of a rule is visible before saving.
 */
export default function GovernancePage() {
  const [policy, setPolicy] = React.useState<ContactPolicy>(() => getContactPolicy());
  const [saved, setSaved] = React.useState(() => JSON.stringify(getContactPolicy()));
  const { profiles } = useAllProfiles();

  const dirty = JSON.stringify(policy) !== saved;

  const save = () => {
    saveContactPolicy(policy);
    setSaved(JSON.stringify(policy));
    toast.success("Contact policy saved", {
      description: "Every journey now resolves caps against these rules.",
    });
  };

  const reset = () => {
    const fresh = seedContactPolicy();
    setPolicy(fresh);
    toast.info("Rules reset to the seeded policy — not yet saved.");
  };

  const updateRule = (id: string, partial: Partial<FrequencyRule>) =>
    setPolicy((current) => ({
      ...current,
      rules: current.rules.map((rule) => (rule.id === id ? { ...rule, ...partial } : rule)),
    }));

  return (
    <>
      <PageHeader
        title="Contact governance"
        description="Air traffic control for customer contact. Rules live here rather than in journeys, and can only ever reduce how often someone is messaged."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw /> Reset rules
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty}>
              <Save /> {dirty ? "Save policy" : "Saved"}
            </Button>
          </>
        }
      />

      <PageBody className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Workspace ceiling</CardTitle>
              <p className="text-[12px] text-muted-foreground">
                The most any customer may receive. Every rule below reduces from this — nothing
                can raise it.
              </p>
            </CardHeader>
            <CardContent className="flex items-end gap-3 pt-0">
              <div className="w-32 space-y-1.5">
                <Label htmlFor="ceiling-max">Max messages</Label>
                <Input
                  id="ceiling-max"
                  type="number"
                  min={1}
                  value={policy.ceilingMaxMessages}
                  onChange={(event) =>
                    setPolicy((current) => ({
                      ...current,
                      ceilingMaxMessages: Math.max(1, Number(event.target.value) || 1),
                    }))
                  }
                />
              </div>
              <div className="w-32 space-y-1.5">
                <Label htmlFor="ceiling-window">Window (days)</Label>
                <Input
                  id="ceiling-window"
                  type="number"
                  min={1}
                  value={policy.ceilingWindowDays}
                  onChange={(event) =>
                    setPolicy((current) => ({
                      ...current,
                      ceilingWindowDays: Math.max(1, Number(event.target.value) || 1),
                    }))
                  }
                />
              </div>
              <p className="pb-2 text-[12.5px] text-muted-foreground">
                = {describeCap(policy.ceilingMaxMessages, policy.ceilingWindowDays)}
              </p>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold tracking-tight">
              Rules
              <span className="ml-2 font-normal text-muted-foreground">
                most restrictive match wins
              </span>
            </h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setPolicy((current) => ({ ...current, rules: [...current.rules, createRule()] }))
              }
            >
              <Plus /> Add rule
            </Button>
          </div>

          <div className="space-y-3">
            {policy.rules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onChange={(partial) => updateRule(rule.id, partial)}
                onRemove={() =>
                  setPolicy((current) => ({
                    ...current,
                    rules: current.rules.filter((item) => item.id !== rule.id),
                  }))
                }
              />
            ))}
          </div>
        </div>

        <PolicyPreview policy={policy} profiles={profiles} />
      </PageBody>
    </>
  );
}

function RuleCard({
  rule,
  onChange,
  onRemove,
}: {
  rule: FrequencyRule;
  onChange: (partial: Partial<FrequencyRule>) => void;
  onRemove: () => void;
}) {
  const updateCondition = (id: string, partial: Partial<FrequencyRule["conditions"][number]>) =>
    onChange({
      conditions: rule.conditions.map((condition) =>
        condition.id === id ? { ...condition, ...partial } : condition,
      ),
    });

  return (
    <Card className={cn(!rule.enabled && "opacity-60")}>
      <CardContent className="space-y-4 py-4">
        <div className="flex items-start gap-3">
          <GripVertical className="mt-2 size-4 shrink-0 text-subtle-foreground" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Input
              value={rule.name}
              onChange={(event) => onChange({ name: event.target.value })}
              className="h-8 border-transparent bg-transparent px-0 text-[13.5px] font-semibold shadow-none focus-visible:border-border focus-visible:px-3"
            />
            <Input
              value={rule.description ?? ""}
              placeholder="What is this rule protecting?"
              onChange={(event) => onChange({ description: event.target.value })}
              className="h-7 border-transparent bg-transparent px-0 text-[12px] text-muted-foreground shadow-none focus-visible:border-border focus-visible:px-3"
            />
          </div>
          <Switch
            checked={rule.enabled}
            onCheckedChange={(enabled) => onChange({ enabled })}
            aria-label="Enable rule"
          />
          <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Delete rule">
            <Trash2 className="text-danger" />
          </Button>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label>When</Label>
          {rule.conditions.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">
              No conditions — applies to every profile.
            </p>
          ) : null}
          {rule.conditions.map((condition) => (
            <div key={condition.id} className="flex flex-wrap items-center gap-2">
              <Input
                list="governance-fields"
                value={condition.field}
                onChange={(event) => updateCondition(condition.id, { field: event.target.value })}
                className="h-8 w-52 font-mono text-[12px]"
              />
              <Select
                value={condition.operator}
                onValueChange={(value) =>
                  updateCondition(condition.id, { operator: value as ConditionOperator })
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
                  onChange={(event) =>
                    updateCondition(condition.id, { value: event.target.value })
                  }
                  className="h-8 w-28 font-mono text-[12px]"
                />
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Remove condition"
                onClick={() =>
                  onChange({
                    conditions: rule.conditions.filter((item) => item.id !== condition.id),
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
            onClick={() => onChange({ conditions: [...rule.conditions, createCondition()] })}
          >
            <Plus /> Add condition
          </Button>
        </div>

        <Separator />

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-28 space-y-1.5">
            <Label>Cap</Label>
            <Input
              type="number"
              min={0}
              value={rule.maxMessages}
              onChange={(event) =>
                onChange({ maxMessages: Math.max(0, Number(event.target.value) || 0) })
              }
              className="h-8"
            />
          </div>
          <div className="w-28 space-y-1.5">
            <Label>Per (days)</Label>
            <Input
              type="number"
              min={1}
              value={rule.windowDays}
              onChange={(event) =>
                onChange({ windowDays: Math.max(1, Number(event.target.value) || 1) })
              }
              className="h-8"
            />
          </div>
          <div className="w-32 space-y-1.5">
            <Label>Channel</Label>
            <Select
              value={rule.channel}
              onValueChange={(value) => onChange({ channel: value as RuleChannel })}
            >
              <SelectTrigger className="h-8 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="push">Push</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="pb-2 text-[12.5px] text-muted-foreground">
            = {describeCap(rule.maxMessages, rule.windowDays)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Resolves the draft policy against every seeded profile. */
function PolicyPreview({
  policy,
  profiles,
}: {
  policy: ContactPolicy;
  profiles: ReturnType<typeof useAllProfiles>["profiles"];
}) {
  const [channel, setChannel] = React.useState<Channel>("email");
  const now = React.useMemo(() => new Date(), []);

  return (
    <div className="space-y-3">
      <datalist id="governance-fields">
        {GOVERNANCE_FIELDS.map((field) => (
          <option key={field} value={field} />
        ))}
      </datalist>

      <Card className="sticky top-6">
        <CardHeader>
          <CardTitle>Resolved caps</CardTitle>
          <p className="text-[12px] text-muted-foreground">
            The draft policy applied to every seeded profile, right now.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <Select value={channel} onValueChange={(value) => setChannel(value as Channel)}>
            <SelectTrigger className="h-8 text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="push">Push</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
            </SelectContent>
          </Select>

          <div className="space-y-2">
            {profiles.map((profile) => {
              const evaluation = resolveCap(policy, profile, channel);
              const used = messagesInWindow(profile, evaluation.windowDays);
              const over = used >= evaluation.maxMessages;

              return (
                <div key={profile.id} className="rounded-lg border border-border px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[12.5px] font-medium">{fullName(profile)}</p>
                    <Badge tone={over ? "negative" : "neutral"}>
                      {used}/{evaluation.maxMessages}
                    </Badge>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
                    <Badge tone="outline">{engagementTierFor(profile.engagementScore)}</Badge>
                    <span>{tenureDays(profile, now)}d tenure</span>
                  </p>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed">
                    <Mono>{describeCap(evaluation.maxMessages, evaluation.windowDays)}</Mono>{" "}
                    <span className="text-muted-foreground">
                      via{" "}
                      {evaluation.sourceId === CEILING_SOURCE_ID
                        ? "the ceiling"
                        : `“${evaluation.sourceName}”`}
                    </span>
                  </p>
                  {over ? (
                    <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-danger-soft px-2 py-1 text-[11px] leading-relaxed text-danger">
                      <TriangleAlert className="mt-px size-3 shrink-0" />
                      Already at or over the cap — the next send would be blocked.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
