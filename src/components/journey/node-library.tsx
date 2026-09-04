"use client";

import * as React from "react";
import { Search } from "lucide-react";
import {
  NODE_CATEGORY_META,
  NODE_KIND_META,
  type JourneyNodeKind,
  type NodeCategory,
} from "@/domain/journey";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NodeIcon } from "./node-icon";

const CATEGORY_ORDER: NodeCategory[] = ["entry", "logic", "action", "control"];

export const NODE_DRAG_TYPE = "application/x-cadence-node";

export function NodeLibrary({ onAddNode }: { onAddNode: (kind: JourneyNodeKind) => void }) {
  const [query, setQuery] = React.useState("");

  const grouped = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: Object.values(NODE_KIND_META).filter(
        (meta) =>
          meta.category === category &&
          (term === "" ||
            meta.label.toLowerCase().includes(term) ||
            meta.description.toLowerCase().includes(term)),
      ),
    })).filter((group) => group.items.length > 0);
  }, [query]);

  return (
    <div className="flex w-[228px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search components"
            className="h-8 pl-8 text-[13px]"
          />
        </div>
      </div>

      <div className="scroll-slim flex-1 overflow-y-auto px-3 py-3">
        {grouped.length === 0 ? (
          <p className="px-1 py-6 text-center text-[12px] text-muted-foreground">
            No components match “{query}”.
          </p>
        ) : (
          grouped.map((group) => (
            <section key={group.category} className="mb-4 last:mb-0">
              <h3 className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-subtle-foreground">
                {NODE_CATEGORY_META[group.category].label}
              </h3>
              <div className="space-y-1">
                {group.items.map((meta) => (
                  <LibraryItem key={meta.kind} kind={meta.kind} onAdd={onAddNode} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <p className="border-t border-border px-4 py-2.5 text-[11px] leading-relaxed text-subtle-foreground">
        Drag onto the canvas, or click to drop into the centre.
      </p>
    </div>
  );
}

function LibraryItem({
  kind,
  onAdd,
}: {
  kind: JourneyNodeKind;
  onAdd: (kind: JourneyNodeKind) => void;
}) {
  const meta = NODE_KIND_META[kind];
  const color = NODE_CATEGORY_META[meta.category].colorVar;

  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(NODE_DRAG_TYPE, kind);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onAdd(kind)}
      title={meta.description}
      className={cn(
        "flex w-full cursor-grab items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors",
        "hover:border-border hover:bg-surface-muted active:cursor-grabbing",
        "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25",
      )}
    >
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5"
        style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
      >
        <NodeIcon kind={kind} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium leading-4">{meta.label}</span>
      </span>
    </button>
  );
}
