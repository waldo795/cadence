"use client";

import * as React from "react";
import { Copy, Info, Trash2, X } from "lucide-react";
import { messageKeysOf } from "@/domain/exclusion";
import {
  CONDITION_OPERATOR_LABELS,
  NODE_CATEGORY_META,
  NODE_KIND_META,
  UNARY_OPERATORS,
  type Channel,
  type ConditionOperator,
  type ConsentChannel,
  type ExclusionCheckConfig,
  type ExclusionScope,
  type JourneyNode,
  type NodeOfKind,
  type WaitUnit,
} from "@/domain/journey";
import { allJourneysSync, journeyDirectory } from "@/services/local-store";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, Mono, Separator } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { blocksToText } from "@/domain/email-content";
import { BlockEditor } from "./block-editor";
import { NodeIcon } from "./node-icon";

interface PropertiesPanelProps {
  node: JourneyNode | null;
  onChange: (nodeId: string, updater: (node: JourneyNode) => JourneyNode) => void;
  onDuplicate: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

/** Common context paths offered as quick-fill hints for condition fields. */
const FIELD_SUGGESTIONS = [
  "profile.appInstalled",
  "profile.loyaltyTier",
  "profile.lifetimeValue",
  "profile.country",
  "profile.emailConsent",
  "profile.pushConsent",
  "event.purchaseCompleted",
  "event.basketValue",
  "event.fixture.homeTeam",
];

export function PropertiesPanel({
  node,
  onChange,
  onDuplicate,
  onDelete,
  onClose,
}: PropertiesPanelProps) {
  if (!node) {
    return (
      <aside className="flex w-[320px] shrink-0 flex-col border-l border-border bg-surface">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <span className="flex size-9 items-center justify-center rounded-full bg-surface-muted text-subtle-foreground">
            <Info className="size-4" />
          </span>
          <div className="space-y-1">
            <p className="text-[13px] font-medium">No node selected</p>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Select a node on the canvas to configure it. Changes apply immediately.
            </p>
          </div>
        </div>
      </aside>
    );
  }

  const meta = NODE_KIND_META[node.kind];
  const color = NODE_CATEGORY_META[meta.category].colorVar;

  const setLabel = (label: string) => onChange(node.id, (current) => ({ ...current, label }));

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex items-start gap-2.5 border-b border-border px-4 py-3.5">
        <span
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-4"
          style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
        >
          <NodeIcon kind={node.kind} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold tracking-tight">{meta.label}</p>
          <p className="truncate font-mono text-[10.5px] text-subtle-foreground">{node.id}</p>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close panel">
          <X />
        </Button>
      </div>

      <div className="scroll-slim flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <p className="text-[12px] leading-relaxed text-muted-foreground">{meta.description}</p>

        <div className="space-y-1.5">
          <Label htmlFor="node-label">Name on canvas</Label>
          <Input
            id="node-label"
            value={node.label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>

        <Separator />

        <NodeConfigFields node={node} onChange={onChange} />
      </div>

      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        <Button variant="secondary" size="sm" className="flex-1" onClick={() => onDuplicate(node.id)}>
          <Copy /> Duplicate
        </Button>
        <Tooltip content="Delete node (or press Delete)" side="top">
          <Button variant="ghost" size="icon-sm" onClick={() => onDelete(node.id)} aria-label="Delete node">
            <Trash2 className="text-danger" />
          </Button>
        </Tooltip>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/* Per-kind configuration                                                     */
/* -------------------------------------------------------------------------- */

function NodeConfigFields({
  node,
  onChange,
}: {
  node: JourneyNode;
  onChange: PropertiesPanelProps["onChange"];
}) {
  /** Typed helper: patches the config of a node of a known kind. */
  function patch<K extends JourneyNode["kind"]>(
    kind: K,
    partial: Partial<NodeOfKind<K>["config"]>,
  ) {
    onChange(node.id, (current) => {
      if (current.kind !== kind) return current;
      return { ...current, config: { ...current.config, ...partial } } as JourneyNode;
    });
  }

  switch (node.kind) {
    case "event_trigger":
      return (
        <div className="space-y-4">
          <TextField
            label="Event name"
            value={node.config.eventName}
            mono
            placeholder="ticket.purchased"
            onChange={(eventName) => patch("event_trigger", { eventName })}
          />
          <TextAreaField
            label="Description"
            value={node.config.description ?? ""}
            placeholder="What causes this event to fire?"
            onChange={(description) => patch("event_trigger", { description })}
          />
        </div>
      );

    case "audience_entry":
      return (
        <div className="space-y-4">
          <TextField
            label="Audience"
            value={node.config.audienceName}
            onChange={(audienceName) => patch("audience_entry", { audienceName })}
          />
          <TextAreaField
            label="Description"
            value={node.config.description ?? ""}
            onChange={(description) => patch("audience_entry", { description })}
          />
        </div>
      );

    case "condition":
      return (
        <div className="space-y-4">
          <FieldPathInput
            label="Attribute"
            value={node.config.field}
            onChange={(field) => patch("condition", { field })}
          />
          <OperatorSelect
            value={node.config.operator}
            onChange={(operator) => patch("condition", { operator })}
          />
          {UNARY_OPERATORS.includes(node.config.operator) ? null : (
            <TextField
              label="Value"
              value={node.config.value}
              mono
              onChange={(value) => patch("condition", { value })}
            />
          )}
          <Hint>
            Outputs a <Mono>TRUE</Mono> and a <Mono>FALSE</Mono> path. Connect both so no profile
            gets stranded.
          </Hint>
        </div>
      );

    case "branch":
      return (
        <div className="space-y-4">
          <p className="text-[12px] text-muted-foreground">
            Evaluated top to bottom. The first match wins; anything else takes the Default path.
          </p>
          {node.config.options.map((option, index) => (
            <div key={option.id} className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <Label>Branch {index + 1}</Label>
                {node.config.options.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Remove branch"
                    onClick={() =>
                      patch("branch", {
                        options: node.config.options.filter((item) => item.id !== option.id),
                      })
                    }
                  >
                    <Trash2 className="text-danger" />
                  </Button>
                ) : null}
              </div>
              <Input
                value={option.label}
                placeholder="Label"
                onChange={(event) =>
                  patch("branch", {
                    options: node.config.options.map((item) =>
                      item.id === option.id ? { ...item, label: event.target.value } : item,
                    ),
                  })
                }
              />
              <Input
                value={option.field}
                placeholder="profile.loyaltyTier"
                className="font-mono text-[12px]"
                onChange={(event) =>
                  patch("branch", {
                    options: node.config.options.map((item) =>
                      item.id === option.id ? { ...item, field: event.target.value } : item,
                    ),
                  })
                }
              />
              <div className="flex gap-2">
                <Select
                  value={option.operator}
                  onValueChange={(value) =>
                    patch("branch", {
                      options: node.config.options.map((item) =>
                        item.id === option.id
                          ? { ...item, operator: value as ConditionOperator }
                          : item,
                      ),
                    })
                  }
                >
                  <SelectTrigger className="flex-1">
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
                <Input
                  value={option.value}
                  placeholder="Value"
                  className="w-24 font-mono text-[12px]"
                  onChange={(event) =>
                    patch("branch", {
                      options: node.config.options.map((item) =>
                        item.id === option.id ? { ...item, value: event.target.value } : item,
                      ),
                    })
                  }
                />
              </div>
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() =>
              patch("branch", {
                options: [
                  ...node.config.options,
                  {
                    id: `branch_${Math.random().toString(36).slice(2, 7)}`,
                    label: `Branch ${node.config.options.length + 1}`,
                    field: "profile.loyaltyTier",
                    operator: "equals",
                    value: "",
                  },
                ],
              })
            }
          >
            Add branch
          </Button>
        </div>
      );

    case "wait":
      return (
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="wait-duration">Duration</Label>
              <Input
                id="wait-duration"
                type="number"
                min={1}
                value={node.config.duration}
                onChange={(event) =>
                  patch("wait", { duration: Math.max(1, Number(event.target.value) || 1) })
                }
              />
            </div>
            <div className="w-32 space-y-1.5">
              <Label>Unit</Label>
              <Select
                value={node.config.unit}
                onValueChange={(value) => patch("wait", { unit: value as WaitUnit })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Hint>Simulation advances a virtual clock, so long waits resolve instantly.</Hint>
        </div>
      );

    case "wait_until":
      return (
        <div className="space-y-4">
          <TextField
            label="Expression"
            value={node.config.expression}
            mono
            placeholder="event.fixture.startTime - 48 hours"
            onChange={(expression) => patch("wait_until", { expression })}
          />
          <Hint>
            Format: <Mono>path ± amount unit</Mono>. The path is resolved against the triggering
            event or the profile.
          </Hint>
        </div>
      );

    case "percentage_split": {
      const total = node.config.options.reduce((sum, option) => sum + option.percentage, 0);
      return (
        <div className="space-y-4">
          {node.config.options.map((option, index) => (
            <div key={option.id} className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label>Path {index + 1}</Label>
                <Input
                  value={option.label}
                  onChange={(event) =>
                    patch("percentage_split", {
                      options: node.config.options.map((item) =>
                        item.id === option.id ? { ...item, label: event.target.value } : item,
                      ),
                    })
                  }
                />
              </div>
              <div className="w-20 space-y-1.5">
                <Label>%</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={option.percentage}
                  onChange={(event) =>
                    patch("percentage_split", {
                      options: node.config.options.map((item) =>
                        item.id === option.id
                          ? { ...item, percentage: Number(event.target.value) || 0 }
                          : item,
                      ),
                    })
                  }
                />
              </div>
              {node.config.options.length > 2 ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove path"
                  onClick={() =>
                    patch("percentage_split", {
                      options: node.config.options.filter((item) => item.id !== option.id),
                    })
                  }
                >
                  <Trash2 className="text-danger" />
                </Button>
              ) : null}
            </div>
          ))}
          <p
            className={
              total === 100
                ? "text-[12px] text-muted-foreground"
                : "text-[12px] font-medium text-danger"
            }
          >
            Total: {total}%{total === 100 ? "" : " — must equal 100%"}
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() =>
              patch("percentage_split", {
                options: [
                  ...node.config.options,
                  {
                    id: `split_${Math.random().toString(36).slice(2, 7)}`,
                    label: `Variant ${String.fromCharCode(65 + node.config.options.length)}`,
                    percentage: 0,
                  },
                ],
              })
            }
          >
            Add path
          </Button>
        </div>
      );
    }

    case "send_email":
      return (
        <div className="space-y-4">
          <TextField
            label="Template"
            value={node.config.template}
            mono
            onChange={(template) => patch("send_email", { template })}
          />
          <MessageKeyField
            value={node.config.messageKey}
            onChange={(messageKey) => patch("send_email", { messageKey })}
          />
          <TextField
            label="Sender name"
            value={node.config.senderName}
            onChange={(senderName) => patch("send_email", { senderName })}
          />
          <TextField
            label="Subject"
            value={node.config.subject}
            onChange={(subject) => patch("send_email", { subject })}
          />
          <TextField
            label="Inbox preview line"
            value={node.config.preheader ?? ""}
            onChange={(preheader) => patch("send_email", { preheader })}
          />
          <BlockEditor
            config={node.config}
            onChange={(blocks) =>
              /*
               * `body` is written alongside the blocks, not left behind.
               * It is the plain-text part of every send and what an older
               * reader of this node still expects, so letting it drift from
               * the blocks would mean two versions of the same email.
               */
              patch("send_email", { blocks, body: blocksToText(blocks) })
            }
          />
          <PersonalisationHint />
        </div>
      );

    case "send_push":
      return (
        <div className="space-y-4">
          <TextField
            label="Template"
            value={node.config.template}
            mono
            onChange={(template) => patch("send_push", { template })}
          />
          <MessageKeyField
            value={node.config.messageKey}
            onChange={(messageKey) => patch("send_push", { messageKey })}
          />
          <TextField
            label="Title"
            value={node.config.title}
            onChange={(title) => patch("send_push", { title })}
          />
          <TextAreaField
            label="Body preview"
            value={node.config.body}
            rows={3}
            onChange={(body) => patch("send_push", { body })}
          />
          <PersonalisationHint />
        </div>
      );

    case "webhook":
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select
              value={node.config.method}
              onValueChange={(value) =>
                patch("webhook", { method: value as "GET" | "POST" | "PUT" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="GET">GET</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <TextField
            label="URL"
            value={node.config.url}
            mono
            onChange={(url) => patch("webhook", { url })}
          />
          <Hint>No HTTP request is made in the PoC — the call is recorded and simulated.</Hint>
        </div>
      );

    case "update_profile":
      return (
        <div className="space-y-4">
          <TextField
            label="Attribute"
            value={node.config.attribute}
            mono
            onChange={(attribute) => patch("update_profile", { attribute })}
          />
          <TextField
            label="Value"
            value={node.config.value}
            mono
            onChange={(value) => patch("update_profile", { value })}
          />
          <Hint>Writes are simulated and do not persist to the profile store.</Hint>
        </div>
      );

    case "frequency_check":
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Cap source</Label>
            <Select
              value={node.config.mode}
              onValueChange={(value) =>
                patch("frequency_check", { mode: value as "governed" | "local" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="governed">Workspace contact policy</SelectItem>
                <SelectItem value="local">Stricter cap for this journey</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Channel</Label>
            <Select
              value={node.config.channel}
              onValueChange={(value) => patch("frequency_check", { channel: value as Channel })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="push">Push</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {node.config.mode === "local" ? (
            <div className="flex gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="freq-max">Max messages</Label>
                <Input
                  id="freq-max"
                  type="number"
                  min={1}
                  value={node.config.maxMessages}
                  onChange={(event) =>
                    patch("frequency_check", {
                      maxMessages: Math.max(1, Number(event.target.value) || 1),
                    })
                  }
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="freq-window">Window (days)</Label>
                <Input
                  id="freq-window"
                  type="number"
                  min={1}
                  value={node.config.windowDays}
                  onChange={(event) =>
                    patch("frequency_check", {
                      windowDays: Math.max(1, Number(event.target.value) || 1),
                    })
                  }
                />
              </div>
            </div>
          ) : null}

          <Hint>
            {node.config.mode === "governed" ? (
              <>
                The cap is resolved per profile from the workspace contact policy, so changing
                governance protects every journey at once.
              </>
            ) : (
              <>
                A local cap can only make this journey <strong>stricter</strong>. If the workspace
                policy is tighter for a given profile, that still wins.
              </>
            )}
          </Hint>
        </div>
      );

    case "exclusion_check":
      return (
        <ExclusionFields
          config={node.config}
          onPatch={(partial) => patch("exclusion_check", partial)}
        />
      );

    case "consent_check":
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Channel</Label>
            <Select
              value={node.config.channel}
              onValueChange={(value) =>
                patch("consent_check", { channel: value as ConsentChannel })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any marketing channel</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="push">Push</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <TextField
            label="Purpose"
            value={node.config.purpose}
            placeholder="Marketing"
            onChange={(purpose) => patch("consent_check", { purpose })}
          />
          <Hint>
            Global suppression is checked first, then channel consent, then device availability.
          </Hint>
        </div>
      );

    case "exit":
      return (
        <div className="space-y-4">
          <TextField
            label="Reason"
            value={node.config.reason ?? ""}
            placeholder="Journey complete"
            onChange={(reason) => patch("exit", { reason })}
          />
          <Field label="Outcome">
            <span className="text-muted-foreground">
              The profile leaves the journey and stops being evaluated.
            </span>
          </Field>
        </div>
      );
  }
}

/**
 * Exclusion references are picked from live journeys but stored as a lineage
 * key. The panel shows which version that key currently resolves to, so it is
 * obvious the reference tracks the journey rather than a frozen build.
 */
function ExclusionFields({
  config,
  onPatch,
}: {
  config: ExclusionCheckConfig;
  onPatch: (partial: Partial<ExclusionCheckConfig>) => void;
}) {
  const references = React.useMemo(() => journeyDirectory.list(), []);
  const journeys = React.useMemo(() => allJourneysSync(), []);
  const resolved = config.journeyKey ? journeyDirectory.resolve(config.journeyKey) : null;

  const messageKeys = React.useMemo(() => {
    const target = journeys.find((journey) => journey.id === resolved?.id);
    return target ? messageKeysOf(target) : [];
  }, [journeys, resolved]);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Exclude if contacted by</Label>
        <Select
          value={config.journeyKey || undefined}
          onValueChange={(value) => onPatch({ journeyKey: value, messageKey: undefined })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose a journey" />
          </SelectTrigger>
          <SelectContent>
            {references.map((reference) => (
              <SelectItem key={reference.key} value={reference.key}>
                {reference.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {resolved ? (
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            <Mono>{config.journeyKey}</Mono> currently resolves to{" "}
            <strong>
              {resolved.name} v{resolved.version}
            </strong>{" "}
            ({resolved.status}).
          </p>
        ) : config.journeyKey ? (
          <p className="text-[11.5px] font-medium text-danger">
            No live journey has the key “{config.journeyKey}”.
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label>Scope</Label>
        <Select
          value={config.scope}
          onValueChange={(value) => onPatch({ scope: value as ExclusionScope })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="journey">Any message from that journey</SelectItem>
            <SelectItem value="message">One specific message</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {config.scope === "message" ? (
        <div className="space-y-1.5">
          <Label>Message</Label>
          <Select
            value={config.messageKey || undefined}
            onValueChange={(value) => onPatch({ messageKey: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder={messageKeys.length ? "Choose a message" : "No messages"} />
            </SelectTrigger>
            <SelectContent>
              {messageKeys.map((key) => (
                <SelectItem key={key} value={key}>
                  {key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="exclusion-window">Look back (days)</Label>
          <Input
            id="exclusion-window"
            type="number"
            min={1}
            value={config.withinDays}
            onChange={(event) =>
              onPatch({ withinDays: Math.max(1, Number(event.target.value) || 1) })
            }
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label>Channel</Label>
          <Select
            value={config.channel}
            onValueChange={(value) => onPatch({ channel: value as ConsentChannel })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any channel</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="push">Push</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Hint>
        Stored as a journey <em>key</em>, not a version. If the referenced journey is stopped and
        rebuilt, this check follows the new version automatically.
      </Hint>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small shared controls                                                      */
/* -------------------------------------------------------------------------- */

function TextField({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        className={mono ? "font-mono text-[12px]" : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** The identifier other journeys exclude against — deliberately called out. */
function MessageKeyField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Message key</Label>
      <Input
        id={id}
        value={value}
        className="font-mono text-[12px]"
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        Other journeys suppress against this key. Keep it stable when you rewrite the copy.
      </p>
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function FieldPathInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = React.useId();
  const listId = `${id}-suggestions`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        list={listId}
        value={value}
        className="font-mono text-[12px]"
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {FIELD_SUGGESTIONS.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </div>
  );
}

function OperatorSelect({
  value,
  onChange,
}: {
  value: ConditionOperator;
  onChange: (value: ConditionOperator) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Operator</Label>
      <Select value={value} onValueChange={(next) => onChange(next as ConditionOperator)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(CONDITION_OPERATOR_LABELS).map(([operator, label]) => (
            <SelectItem key={operator} value={operator}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-surface-muted px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

function PersonalisationHint() {
  return (
    <Hint>
      Use <Mono>{"{{profile.firstName}}"}</Mono> or <Mono>{"{{event.fixture.homeTeam}}"}</Mono>.
      Rendered against the selected profile during simulation.
    </Hint>
  );
}
