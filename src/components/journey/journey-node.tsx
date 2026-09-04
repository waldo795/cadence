"use client";

import * as React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Check, X } from "lucide-react";
import {
  NODE_CATEGORY_META,
  NODE_KIND_META,
  getNodeOutputs,
  type NodeHandleSpec,
} from "@/domain/journey";
import { summariseNode } from "@/domain/summary";
import { cn } from "@/lib/utils";
import { NodeIcon } from "./node-icon";
import type { JourneyFlowNode } from "./flow-mapping";

const TONE_CLASS: Record<NodeHandleSpec["tone"], string> = {
  neutral: "text-subtle-foreground",
  positive: "text-success",
  negative: "text-danger",
};

const OUTCOME_STYLE: Record<string, string> = {
  TRUE: "bg-success-soft text-success",
  PASS: "bg-success-soft text-success",
  MATCHED: "bg-success-soft text-success",
  FALSE: "bg-danger-soft text-danger",
  BLOCKED: "bg-danger-soft text-danger",
  ERROR: "bg-danger-soft text-danger",
  WAITING: "bg-warning-soft text-warning",
  SIMULATED: "bg-accent-soft text-accent",
  ENTERED: "bg-accent-soft text-accent",
  UPDATED: "bg-accent-soft text-accent",
  CALLED: "bg-accent-soft text-accent",
  EXITED: "bg-surface-muted text-muted-foreground",
};

/**
 * A journey node as it appears on the canvas.
 *
 * The node deliberately carries its own summary line and outlet labels so the
 * graph can be read end-to-end without selecting anything.
 */
function JourneyNodeComponent({ data, selected }: NodeProps<JourneyFlowNode>) {
  const { node, simState, simOutcome } = data;
  const meta = NODE_KIND_META[node.kind];
  const category = NODE_CATEGORY_META[meta.category];
  const summary = summariseNode(node);
  const outputs = getNodeOutputs(node);

  const dimmed = simState === "idle";
  const isCurrent = simState === "current";

  return (
    <div
      className={cn(
        "group relative w-[248px] rounded-xl border bg-surface transition-[box-shadow,border-color,opacity]",
        "shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]",
        selected
          ? "border-accent ring-2 ring-ring/30"
          : "border-border hover:border-border-strong",
        isCurrent && "border-accent ring-2 ring-ring/45 shadow-lg",
        simState === "visited" && !selected && "border-accent/45",
        dimmed && "opacity-40",
      )}
    >
      {/* Category stripe — the only decorative element, and it carries meaning. */}
      <span
        aria-hidden
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
        style={{ backgroundColor: category.colorVar }}
      />

      {/* Unnamed on purpose: a node has exactly one input, and React Flow only
          matches an edge with no `targetHandle` against an id-less handle. */}
      {meta.hasInput ? <Handle type="target" position={Position.Top} isConnectable /> : null}

      <div className="px-3.5 py-3 pl-4">
        <div className="flex items-start gap-2.5">
          <span
            className="mt-px flex size-6 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5"
            style={{ backgroundColor: `color-mix(in oklab, ${category.colorVar} 14%, transparent)`, color: category.colorVar }}
          >
            <NodeIcon kind={node.kind} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-[13px] font-semibold leading-5 tracking-tight">
                {node.label}
              </p>
              {simOutcome ? (
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-px font-mono text-[9px] font-bold tracking-wide",
                    OUTCOME_STYLE[simOutcome] ?? "bg-surface-muted text-muted-foreground",
                  )}
                >
                  {simOutcome}
                </span>
              ) : null}
            </div>
            <p className="mt-px text-[10px] uppercase tracking-wider text-subtle-foreground">
              {meta.label}
            </p>
          </div>
        </div>

        <div className="mt-2.5 space-y-1 border-t border-border pt-2.5">
          <p className="text-[10px] uppercase tracking-wider text-subtle-foreground">
            {summary.caption}
          </p>
          {summary.mono ? (
            <p className="break-words font-mono text-[11px] leading-4 text-foreground">
              {summary.value}
            </p>
          ) : (
            <p className="break-words text-[12px] leading-4 text-foreground">{summary.value}</p>
          )}
          {summary.note ? (
            <p className="truncate text-[11px] text-muted-foreground">{summary.note}</p>
          ) : null}
        </div>
      </div>

      {outputs.length > 0 ? (
        <div className="flex items-stretch border-t border-border">
          {outputs.map((output, index) => (
            // Each outlet owns a cell, and its handle sits at the cell's centre —
            // multi-branch nodes then read as a row of labelled exits.
            <div
              key={output.id}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-1 py-1.5 text-[9.5px] font-semibold uppercase tracking-wider",
                TONE_CLASS[output.tone],
                index > 0 && "border-l border-border",
              )}
            >
              {output.tone === "positive" ? <Check className="size-2.5" /> : null}
              {output.tone === "negative" ? <X className="size-2.5" /> : null}
              <span className="truncate">{output.label || "Next"}</span>
              <Handle
                type="source"
                position={Position.Bottom}
                id={output.id}
                isConnectable
                style={{ left: "50%", transform: "translateX(-50%)" }}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const JourneyNodeView = React.memo(JourneyNodeComponent);
