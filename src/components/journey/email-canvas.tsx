"use client";

import * as React from "react";
import { GripVertical } from "lucide-react";
import {
  SPACER_HEIGHT,
  type BlockLocation,
  type EmailBlock,
  type EmailBlockKind,
} from "@/domain/email-content";
import type { EmailTheme } from "@/domain/email-theme";
import { cn } from "@/lib/utils";

/**
 * The editable email.
 *
 * Rendered as React rather than the real HTML, because you cannot drag into
 * an iframe and the real output is tables all the way down. It approximates
 * the email closely enough to lay one out; the Preview toggle shows the
 * actual render, which is the one that counts.
 *
 * Native HTML5 drag events rather than a drag-and-drop library: a palette, a
 * list, and one level of nesting is the whole requirement, and it keeps the
 * dependency list where it is.
 */

/** What a drag is carrying. */
export type DragPayload =
  | { type: "new"; kind: EmailBlockKind; widths?: number[] }
  | { type: "move"; id: string };

const MIME = "application/x-cadence-block";

export function encodeDrag(event: React.DragEvent, payload: DragPayload) {
  event.dataTransfer.setData(MIME, JSON.stringify(payload));
  event.dataTransfer.effectAllowed = payload.type === "new" ? "copy" : "move";
}

function decodeDrag(event: React.DragEvent): DragPayload | null {
  const raw = event.dataTransfer.getData(MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Canvas                                                                     */
/* -------------------------------------------------------------------------- */

export function EmailCanvas({
  blocks,
  theme,
  selectedId,
  onSelect,
  onDrop,
}: {
  blocks: EmailBlock[];
  theme: EmailTheme;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDrop: (payload: DragPayload, at: BlockLocation) => void;
}) {
  return (
    <div
      className="mx-auto w-full max-w-[640px] rounded-lg p-4"
      style={{ background: theme.pageColor }}
      onClick={() => onSelect(null)}
    >
      <div className="overflow-hidden rounded-[10px]" style={{ background: theme.cardColor }}>
        <div className="px-6 pb-1 pt-6">
          <span
            style={{ color: theme.textColor, fontFamily: theme.fontStack }}
            className="text-[15px] font-semibold"
          >
            {theme.brandName}
          </span>
        </div>

        <div className="px-6 pb-4 pt-3">
          <BlockList
            blocks={blocks}
            theme={theme}
            containerId={null}
            columnIndex={0}
            selectedId={selectedId}
            onSelect={onSelect}
            onDrop={onDrop}
          />
        </div>

        <div className="px-6 pb-6">
          <div className="border-t pt-3" style={{ borderColor: "#e6e1dc" }}>
            {theme.footerLines.filter(Boolean).map((line, index) => (
              <p
                key={index}
                style={{ color: theme.mutedColor, fontFamily: theme.fontStack }}
                className="text-[11px] leading-relaxed"
              >
                {line}
              </p>
            ))}
            <p
              style={{ color: theme.mutedColor, fontFamily: theme.fontStack }}
              className="mt-2 text-[11px] underline"
            >
              Unsubscribe from these emails
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BlockList({
  blocks,
  theme,
  containerId,
  columnIndex,
  selectedId,
  onSelect,
  onDrop,
  compact = false,
}: {
  blocks: EmailBlock[];
  theme: EmailTheme;
  containerId: string | null;
  columnIndex: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDrop: (payload: DragPayload, at: BlockLocation) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("relative", compact && "min-h-[72px]")}>
      <DropZone
        at={{ containerId, columnIndex, index: 0 }}
        onDrop={onDrop}
        hint={blocks.length === 0 ? (compact ? "Drop here" : "Drag an element here") : undefined}
      />

      {blocks.map((block, index) => (
        <React.Fragment key={block.id}>
          <CanvasBlock
            block={block}
            theme={theme}
            selectedId={selectedId}
            onSelect={onSelect}
            onDrop={onDrop}
          />
          <DropZone
            at={{ containerId, columnIndex, index: index + 1 }}
            onDrop={onDrop}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

/**
 * The gap between two blocks, and the only thing a drop can land on.
 *
 * Making the gaps the targets rather than the blocks means a drop always has
 * an unambiguous destination — "before this one" or "after it" — instead of
 * depending on which half of a block the pointer was over.
 */
function DropZone({
  at,
  onDrop,
  hint,
}: {
  at: BlockLocation;
  onDrop: (payload: DragPayload, at: BlockLocation) => void;
  hint?: string;
}) {
  const [over, setOver] = React.useState(false);

  return (
    <div
      onDragOver={(event) => {
        // Without preventDefault the browser refuses the drop outright.
        event.preventDefault();
        event.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        const payload = decodeDrag(event);
        if (payload) onDrop(payload, at);
      }}
      className={cn(
        "relative transition-all",
        hint ? "flex items-center justify-center rounded-md border border-dashed" : "h-2",
        hint && (over ? "border-accent bg-accent-soft" : "border-border"),
        hint && "min-h-[64px]",
      )}
    >
      {hint ? (
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      ) : (
        <span
          className={cn(
            "absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full transition-colors",
            over ? "bg-accent" : "bg-transparent",
          )}
        />
      )}
    </div>
  );
}

function CanvasBlock({
  block,
  theme,
  selectedId,
  onSelect,
  onDrop,
}: {
  block: EmailBlock;
  theme: EmailTheme;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDrop: (payload: DragPayload, at: BlockLocation) => void;
}) {
  const selected = selectedId === block.id;
  const [dragging, setDragging] = React.useState(false);

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.stopPropagation();
        encodeDrag(event, { type: "move", id: block.id });
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(block.id);
      }}
      className={cn(
        "group relative cursor-grab rounded-md outline-offset-2 transition-opacity",
        selected && "outline outline-2 outline-accent",
        !selected && "hover:outline hover:outline-1 hover:outline-border-strong",
        dragging && "opacity-40",
      )}
    >
      <span
        className={cn(
          "absolute -left-5 top-1 hidden text-subtle-foreground group-hover:block",
          selected && "block",
        )}
        aria-hidden
      >
        <GripVertical className="size-3.5" />
      </span>

      <BlockPreview
        block={block}
        theme={theme}
        selectedId={selectedId}
        onSelect={onSelect}
        onDrop={onDrop}
      />
    </div>
  );
}

function BlockPreview({
  block,
  theme,
  selectedId,
  onSelect,
  onDrop,
}: {
  block: EmailBlock;
  theme: EmailTheme;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDrop: (payload: DragPayload, at: BlockLocation) => void;
}) {
  const font = { fontFamily: theme.fontStack };

  switch (block.kind) {
    case "heading":
      return (
        <p
          style={{ ...font, color: theme.textColor, fontSize: block.level === 1 ? 24 : 18 }}
          className="px-1 py-1 font-semibold leading-snug"
        >
          {block.text || <Placeholder>Heading</Placeholder>}
        </p>
      );

    case "text":
      return (
        <div style={{ ...font, color: theme.textColor }} className="px-1 py-1 text-[14px] leading-relaxed">
          {block.text ? (
            block.text.split(/\n{2,}/).map((paragraph, index) => (
              <p key={index} className="mb-2 last:mb-0 whitespace-pre-wrap">
                {paragraph}
              </p>
            ))
          ) : (
            <Placeholder>Empty paragraph</Placeholder>
          )}
        </div>
      );

    case "image":
      return block.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={block.url}
          alt={block.alt}
          className="block w-full rounded-md"
          draggable={false}
        />
      ) : (
        <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border">
          <Placeholder>No image chosen</Placeholder>
        </div>
      );

    case "button":
      return (
        <div className="px-1 py-1.5">
          <span
            style={{ ...font, background: theme.accentColor }}
            className={cn(
              "inline-block rounded-md px-5 py-2.5 text-[13px] font-semibold text-white",
              !block.href.trim() && "opacity-50",
            )}
          >
            {block.label || "Button"}
          </span>
          {!block.href.trim() ? (
            <span className="ml-2 text-[11px] text-warning">no link — will be left out</span>
          ) : null}
        </div>
      );

    case "divider":
      return <div className="my-2 border-t" style={{ borderColor: "#e6e1dc" }} />;

    case "spacer":
      return (
        <div
          style={{ height: SPACER_HEIGHT[block.size] }}
          className="flex items-center justify-center rounded border border-dashed border-border/60"
        >
          <span className="text-[10px] text-subtle-foreground">{block.size}</span>
        </div>
      );

    case "columns": {
      const total = block.widths.reduce((sum, width) => sum + width, 0) || 1;
      return (
        <div className="flex gap-2 px-1 py-1">
          {block.columns.map((column, index) => (
            <div
              key={index}
              style={{ width: `${((block.widths[index] ?? 1) / total) * 100}%` }}
              className="min-w-0"
            >
              <BlockList
                blocks={column}
                theme={theme}
                containerId={block.id}
                columnIndex={index}
                selectedId={selectedId}
                onSelect={onSelect}
                onDrop={onDrop}
                compact
              />
            </div>
          ))}
        </div>
      );
    }
  }
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return <span className="text-[12px] italic text-subtle-foreground">{children}</span>;
}
