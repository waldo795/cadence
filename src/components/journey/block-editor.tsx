"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronUp,
  Heading,
  Image as ImageIcon,
  Minus,
  MousePointerClick,
  Text as TextIcon,
  Trash2,
  MoveVertical,
} from "lucide-react";
import {
  BLOCK_LABEL,
  blocksFor,
  createBlock,
  type EmailBlock,
  type EmailBlockKind,
} from "@/domain/email-content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * The email body editor.
 *
 * A list of blocks with up/down controls rather than drag-and-drop: a journey
 * email is five or six blocks, the panel it lives in is narrow, and dragging
 * inside an already-scrolling sidebar is harder to use than two buttons.
 */

const KIND_ICON: Record<EmailBlockKind, React.ComponentType<{ className?: string }>> = {
  heading: Heading,
  text: TextIcon,
  image: ImageIcon,
  button: MousePointerClick,
  divider: Minus,
  spacer: MoveVertical,
};

const ADDABLE: EmailBlockKind[] = ["text", "heading", "image", "button", "divider", "spacer"];

export function BlockEditor({
  config,
  onChange,
}: {
  config: { body: string; blocks?: EmailBlock[] };
  onChange: (blocks: EmailBlock[]) => void;
}) {
  /*
   * Derived every render rather than held in state. A node with no blocks
   * yet shows the ones recovered from its plain text, and the first edit
   * saves the whole list — so opening the editor is not itself a change, but
   * touching anything commits the conversion.
   */
  const blocks = blocksFor(config);

  const replace = (id: string, next: Partial<EmailBlock>) => {
    onChange(
      blocks.map((block) => (block.id === id ? ({ ...block, ...next } as EmailBlock) : block)),
    );
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const remove = (id: string) => onChange(blocks.filter((block) => block.id !== id));

  const add = (kind: EmailBlockKind) => onChange([...blocks, createBlock(kind)]);

  return (
    <div className="space-y-2.5">
      <Label>Email body</Label>

      <div className="space-y-2">
        {blocks.map((block, index) => {
          const Icon = KIND_ICON[block.kind];
          return (
            <div
              key={block.id}
              className="rounded-lg border border-border bg-surface-muted/40 p-2.5"
            >
              <div className="mb-2 flex items-center gap-1.5">
                <Icon className="size-3 shrink-0 text-subtle-foreground" />
                <span className="flex-1 text-[11px] font-medium text-muted-foreground">
                  {BLOCK_LABEL[block.kind]}
                </span>
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
                  disabled={index === blocks.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ChevronDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${BLOCK_LABEL[block.kind].toLowerCase()}`}
                  onClick={() => remove(block.id)}
                >
                  <Trash2 />
                </Button>
              </div>

              <BlockFields block={block} onChange={(next) => replace(block.id, next)} />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1">
        {ADDABLE.map((kind) => {
          const Icon = KIND_ICON[kind];
          return (
            <Button key={kind} variant="secondary" size="sm" onClick={() => add(kind)}>
              <Icon /> {BLOCK_LABEL[kind]}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function BlockFields({
  block,
  onChange,
}: {
  block: EmailBlock;
  onChange: (next: Partial<EmailBlock>) => void;
}) {
  switch (block.kind) {
    case "heading":
      return (
        <div className="space-y-1.5">
          <Input
            value={block.text}
            placeholder="A heading"
            onChange={(event) => onChange({ text: event.target.value })}
          />
          <div className="flex gap-1">
            {([1, 2] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => onChange({ level })}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] transition-colors",
                  block.level === level
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border text-muted-foreground hover:bg-surface-muted",
                )}
              >
                {level === 1 ? "Title" : "Section"}
              </button>
            ))}
          </div>
        </div>
      );

    case "text":
      return (
        <textarea
          value={block.text}
          rows={4}
          placeholder="Write the paragraph. Blank lines start a new one."
          onChange={(event) => onChange({ text: event.target.value })}
          className="scroll-slim w-full resize-y rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      );

    case "image":
      return (
        <div className="space-y-1.5">
          <Input
            value={block.url}
            placeholder="https://… image URL"
            onChange={(event) => onChange({ url: event.target.value })}
          />
          <Input
            value={block.alt}
            placeholder="Describe the image"
            onChange={(event) => onChange({ alt: event.target.value })}
          />
          <Input
            value={block.href ?? ""}
            placeholder="Link to (optional)"
            onChange={(event) => onChange({ href: event.target.value })}
          />
          <p className="text-[11px] leading-relaxed text-subtle-foreground">
            Must be a public URL — email clients cannot see anything behind a login. Many block
            images by default, so the description is what most people read first.
          </p>
        </div>
      );

    case "button":
      return (
        <div className="space-y-1.5">
          <Input
            value={block.label}
            placeholder="Button text"
            onChange={(event) => onChange({ label: event.target.value })}
          />
          <Input
            value={block.href}
            placeholder="https://…"
            onChange={(event) => onChange({ href: event.target.value })}
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
        <div className="flex gap-1">
          {(["small", "medium", "large"] as const).map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => onChange({ size })}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] capitalize transition-colors",
                block.size === size
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-muted-foreground hover:bg-surface-muted",
              )}
            >
              {size}
            </button>
          ))}
        </div>
      );

    case "divider":
      return <p className="text-[11px] text-subtle-foreground">A horizontal rule.</p>;
  }
}
