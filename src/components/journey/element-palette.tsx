"use client";

import * as React from "react";
import {
  Columns2,
  Heading,
  Image as ImageIcon,
  Minus,
  MousePointerClick,
  MoveVertical,
  Text as TextIcon,
} from "lucide-react";
import { BLOCK_LABEL, COLUMN_PRESETS, type EmailBlockKind } from "@/domain/email-content";
import { encodeDrag } from "./email-canvas";

/**
 * The elements you drag onto the canvas.
 *
 * Also clickable: dragging is the obvious gesture but it is the slower one
 * when you just want another paragraph at the end, and it is unusable with a
 * keyboard.
 */

const ICONS: Record<Exclude<EmailBlockKind, "columns">, React.ComponentType<{ className?: string }>> =
  {
    text: TextIcon,
    heading: Heading,
    image: ImageIcon,
    button: MousePointerClick,
    divider: Minus,
    spacer: MoveVertical,
  };

const CONTENT: Exclude<EmailBlockKind, "columns">[] = [
  "text",
  "heading",
  "image",
  "button",
  "divider",
  "spacer",
];

export function ElementPalette({
  onAdd,
}: {
  onAdd: (kind: EmailBlockKind, widths?: number[]) => void;
}) {
  return (
    <div className="space-y-4 p-4">
      <section className="space-y-2">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-subtle-foreground">
          Content
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          {CONTENT.map((kind) => {
            const Icon = ICONS[kind];
            return (
              <button
                key={kind}
                type="button"
                draggable
                onDragStart={(event) => encodeDrag(event, { type: "new", kind })}
                onClick={() => onAdd(kind)}
                className="flex cursor-grab flex-col items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-3 text-[11px] text-muted-foreground transition-colors hover:border-border-strong hover:bg-surface-muted hover:text-foreground"
              >
                <Icon className="size-4" />
                {BLOCK_LABEL[kind]}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-subtle-foreground">
          Layout
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          {COLUMN_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              draggable
              onDragStart={(event) =>
                encodeDrag(event, { type: "new", kind: "columns", widths: preset.widths })
              }
              onClick={() => onAdd("columns", preset.widths)}
              className="flex cursor-grab flex-col items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-3 transition-colors hover:border-border-strong hover:bg-surface-muted"
            >
              {/* The shape of the layout reads faster than its name. */}
              <span className="flex w-full gap-0.5 px-1">
                {preset.widths.map((width, index) => (
                  <span
                    key={index}
                    style={{ flexGrow: width }}
                    className="h-4 rounded-[2px] bg-border-strong"
                  />
                ))}
              </span>
              <span className="text-[10.5px] text-muted-foreground">{preset.label}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-subtle-foreground">
          Columns sit side by side on a desktop and stack on a phone.
        </p>
      </section>

      <section className="space-y-1.5">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-subtle-foreground">
          <Columns2 className="mr-1 inline size-3" />
          Tip
        </h3>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Drag onto the canvas to place an element exactly, or click to add it at the end.
          Drag anything already on the canvas to move it, including into a column.
        </p>
      </section>
    </div>
  );
}
