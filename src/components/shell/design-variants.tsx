"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Palette, Plus, Trash2 } from "lucide-react";
import {
  CONDITION_OPERATOR_LABELS,
  UNARY_OPERATORS,
  type ConditionOperator,
} from "@/domain/journey";
import { createVariant, type DesignVariant } from "@/domain/email-theme";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/**
 * Looks that replace part of the design for some clients.
 *
 * The first match wins rather than the overrides merging, because a merge of
 * three half-matching looks is not something anyone can predict from reading
 * the list — and "which one applied?" has to have one answer.
 */

const OPERATORS: ConditionOperator[] = [
  "equals",
  "not_equals",
  "contains",
  "greater_than",
  "less_than",
  "exists",
  "not_exists",
];

/**
 * The parts of the design a variant may replace.
 *
 * Not everything, and the type says so. A variant that could rewrite the
 * footer would let one client silently see different business details from
 * another, and `variants` itself is excluded because a look that swaps the
 * list of looks has no defined meaning.
 */
type OverridableKey = "heroImageUrl" | "accentColor" | "pageColor" | "cardColor" | "textColor";

const OVERRIDABLE: { key: OverridableKey; label: string; kind: "color" | "text" }[] = [
  { key: "heroImageUrl", label: "Hero image", kind: "text" },
  { key: "accentColor", label: "Accent", kind: "color" },
  { key: "pageColor", label: "Background", kind: "color" },
  { key: "cardColor", label: "Card", kind: "color" },
  { key: "textColor", label: "Text", kind: "color" },
];

export function DesignVariants({
  variants,
  onChange,
}: {
  variants: DesignVariant[];
  onChange: (next: DesignVariant[]) => void;
}) {
  const [openId, setOpenId] = React.useState<string | null>(null);

  const patch = (id: string, next: Partial<DesignVariant>) =>
    onChange(variants.map((item) => (item.id === id ? { ...item, ...next } : item)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= variants.length) return;
    const next = [...variants];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const add = () => {
    const variant = createVariant();
    onChange([...variants, variant]);
    setOpenId(variant.id);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <Label>Looks for particular clients</Label>
        <Button variant="ghost" size="sm" onClick={add}>
          <Plus /> Add a look
        </Button>
      </div>

      <p className="text-[11px] leading-relaxed text-subtle-foreground">
        Checked in order; the first one that matches is used, and the rest are ignored. Anything
        a look does not set falls through to the design above. Values can contain merge fields,
        so <code>{"{{profile.heroImage}}"}</code> works where the URL is on the client record.
      </p>

      {variants.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[12px] text-muted-foreground">
          No looks yet. Every client gets the design above.
        </p>
      ) : (
        <div className="space-y-1.5">
          {variants.map((variant, index) => {
            const open = openId === variant.id;
            const unary = UNARY_OPERATORS.includes(variant.operator);
            const changes = OVERRIDABLE.filter(
              (field) => (variant.overrides[field.key] as string | undefined)?.trim?.() ?? false,
            );

            return (
              <div
                key={variant.id}
                className={cn(
                  "rounded-lg border transition-colors",
                  open ? "border-border-strong" : "border-border",
                  !variant.enabled && "opacity-60",
                )}
              >
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : variant.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <Palette className="size-3.5 shrink-0 text-subtle-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium">
                        {variant.label || "Untitled look"}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {variant.field} {CONDITION_OPERATOR_LABELS[variant.operator]}
                        {unary ? "" : ` ${variant.value || "…"}`}
                      </span>
                    </span>
                    {changes.length > 0 ? (
                      <Badge tone="neutral">{changes.length} changed</Badge>
                    ) : (
                      <Badge tone="warning">changes nothing</Badge>
                    )}
                  </button>

                  <Switch
                    checked={variant.enabled}
                    aria-label={`Enable ${variant.label}`}
                    onCheckedChange={(enabled) => patch(variant.id, { enabled })}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Move down"
                    disabled={index === variants.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${variant.label}`}
                    onClick={() => onChange(variants.filter((item) => item.id !== variant.id))}
                  >
                    <Trash2 />
                  </Button>
                </div>

                {open ? (
                  <div className="space-y-3 border-t border-border p-3">
                    <Input
                      value={variant.label}
                      placeholder="Name this look"
                      onChange={(event) => patch(variant.id, { label: event.target.value })}
                    />

                    <div className="space-y-1.5">
                      <Label className="text-[11px]">Use it when</Label>
                      <div className="grid gap-1.5 sm:grid-cols-[1.2fr_1fr_1fr]">
                        <Input
                          value={variant.field}
                          placeholder="profile.weddingSeason"
                          className="font-mono text-[11.5px]"
                          onChange={(event) => patch(variant.id, { field: event.target.value })}
                        />
                        <Select
                          value={variant.operator}
                          onValueChange={(operator) =>
                            patch(variant.id, { operator: operator as ConditionOperator })
                          }
                        >
                          <SelectTrigger className="text-[12px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OPERATORS.map((operator) => (
                              <SelectItem key={operator} value={operator}>
                                {CONDITION_OPERATOR_LABELS[operator]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {/* Hidden for operators that compare against nothing. */}
                        {unary ? (
                          <span className="self-center text-[11px] text-subtle-foreground">
                            no value needed
                          </span>
                        ) : (
                          <Input
                            value={variant.value}
                            placeholder="winter"
                            onChange={(event) => patch(variant.id, { value: event.target.value })}
                          />
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px]">Change</Label>
                      <div className="space-y-1.5">
                        {OVERRIDABLE.map((field) => {
                          const current = (variant.overrides[field.key] as string) ?? "";
                          const set = (value: string) =>
                            patch(variant.id, {
                              overrides: value
                                ? { ...variant.overrides, [field.key]: value }
                                : // Cleared means "fall through", not "empty".
                                  Object.fromEntries(
                                    Object.entries(variant.overrides).filter(
                                      ([key]) => key !== field.key,
                                    ),
                                  ),
                            });

                          return (
                            <div key={String(field.key)} className="flex items-center gap-2">
                              <span className="w-24 shrink-0 text-[11px] text-muted-foreground">
                                {field.label}
                              </span>
                              {field.kind === "color" ? (
                                <input
                                  type="color"
                                  aria-label={field.label}
                                  value={current || "#ffffff"}
                                  onChange={(event) => set(event.target.value)}
                                  className="size-7 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
                                />
                              ) : null}
                              <Input
                                value={current}
                                placeholder={
                                  field.kind === "color" ? "leave empty to keep" : "https://… or {{profile.heroImage}}"
                                }
                                className={cn(field.kind === "color" && "font-mono text-[11px]")}
                                onChange={(event) => set(event.target.value)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
