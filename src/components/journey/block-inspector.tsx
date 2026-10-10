"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import {
  BLOCK_LABEL,
  COLUMN_PRESETS,
  SPACER_HEIGHT,
  type EmailBlock,
} from "@/domain/email-content";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { FieldInput, FieldTextarea } from "./field-picker";

/**
 * The fields for whichever block is selected on the canvas.
 *
 * Separate from the canvas so the canvas can stay about layout: what is where,
 * what is being dragged, where it will land. Typing into a text box on a
 * 600px canvas also fights the drag handles for the same pixels.
 */
export function BlockInspector({
  block,
  onChange,
  onRemove,
}: {
  block: EmailBlock | null;
  onChange: (patch: Partial<EmailBlock>) => void;
  onRemove: () => void;
}) {
  if (!block) {
    return (
      <div className="p-5">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Select something on the canvas to edit it, or drag an element across from the left.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-semibold tracking-tight">{BLOCK_LABEL[block.kind]}</h3>
        <Button variant="ghost" size="icon-sm" aria-label="Remove block" onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>

      <BlockFields block={block} onChange={onChange} />
    </div>
  );
}

function BlockFields({
  block,
  onChange,
}: {
  block: EmailBlock;
  onChange: (patch: Partial<EmailBlock>) => void;
}) {
  switch (block.kind) {
    case "heading":
      return (
        <div className="space-y-2">
          <FieldInput
            label="Text"
            value={block.text}
            placeholder="A heading"
            onChange={(text) => onChange({ text })}
          />
          <Choice
            label="Size"
            options={[
              { value: 1, label: "Title" },
              { value: 2, label: "Section" },
            ]}
            value={block.level}
            onChange={(level) => onChange({ level })}
          />
        </div>
      );

    case "text":
      return (
        <FieldTextarea
          label="Text"
          value={block.text}
          rows={8}
          placeholder="Write the paragraph. A blank line starts a new one."
          onChange={(text) => onChange({ text })}
        />
      );

    case "image":
      return (
        <div className="space-y-2">
          <FieldInput
            label="Image URL"
            value={block.url}
            placeholder="https://…"
            onChange={(url) => onChange({ url })}
          />
          <FieldInput
            label="Description"
            value={block.alt}
            placeholder="Describe the image"
            onChange={(alt) => onChange({ alt })}
          />
          <FieldInput
            label="Links to (optional)"
            value={block.href ?? ""}
            placeholder="https://…"
            onChange={(href) => onChange({ href })}
          />
          <p className="text-[11px] leading-relaxed text-subtle-foreground">
            Must be a public URL — email clients cannot see anything behind a login. Most block
            images until the reader allows them, so the description is what many people read
            first.
          </p>
        </div>
      );

    case "button":
      return (
        <div className="space-y-2">
          <FieldInput
            label="Label"
            value={block.label}
            placeholder="Book now"
            onChange={(label) => onChange({ label })}
          />
          <FieldInput
            label="Links to"
            value={block.href}
            placeholder="https://…"
            onChange={(href) => onChange({ href })}
          />
          {!block.href.trim() ? (
            <p className="text-[11px] leading-relaxed text-warning">
              A button with no link is left out of the email entirely.
            </p>
          ) : null}
        </div>
      );

    case "spacer":
      return (
        <Choice
          label="Height"
          options={(["small", "medium", "large"] as const).map((size) => ({
            value: size,
            label: `${size[0].toUpperCase()}${size.slice(1)} · ${SPACER_HEIGHT[size]}px`,
          }))}
          value={block.size}
          onChange={(size) => onChange({ size })}
        />
      );

    case "columns":
      return (
        <div className="space-y-2">
          <Label className="text-[11px]">Layout</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {COLUMN_PRESETS.map((preset) => {
              const active =
                preset.widths.length === block.widths.length &&
                preset.widths.every((width, index) => width === block.widths[index]);
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onChange(resizeColumns(block, preset.widths))}
                  className={cn(
                    "space-y-1.5 rounded-md border p-2 transition-colors",
                    active
                      ? "border-accent bg-accent-soft"
                      : "border-border hover:bg-surface-muted",
                  )}
                >
                  <span className="flex gap-0.5">
                    {preset.widths.map((width, index) => (
                      <span
                        key={index}
                        style={{ flexGrow: width }}
                        className={cn(
                          "h-3 rounded-[2px]",
                          active ? "bg-accent/40" : "bg-border-strong",
                        )}
                      />
                    ))}
                  </span>
                  <span className="block text-[10.5px] text-muted-foreground">
                    {preset.label}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] leading-relaxed text-subtle-foreground">
            Columns sit side by side on a desktop and stack on a phone. Dropping to fewer
            columns moves anything in the removed ones into the last column rather than
            discarding it.
          </p>
        </div>
      );

    case "divider":
      return (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          A horizontal rule. Nothing to configure.
        </p>
      );
  }
}

/**
 * Changing the layout never loses content.
 *
 * Going from three columns to two would otherwise drop whatever was in the
 * third — which is a lot of work to lose to a mis-click, and not something
 * the canvas offers any way of undoing.
 */
function resizeColumns(
  block: Extract<EmailBlock, { kind: "columns" }>,
  widths: number[],
): Partial<EmailBlock> {
  const columns: EmailBlock[][] = widths.map((_, index) => block.columns[index] ?? []);
  const orphaned = block.columns.slice(widths.length).flat();
  if (orphaned.length > 0) {
    columns[columns.length - 1] = [...columns[columns.length - 1], ...orphaned];
  }
  return { widths, columns };
}

function Choice<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px]">{label}</Label>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-[11px] transition-colors",
              value === option.value
                ? "border-accent bg-accent-soft text-accent"
                : "border-border text-muted-foreground hover:bg-surface-muted",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
