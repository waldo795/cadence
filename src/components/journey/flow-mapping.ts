import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { JourneyDefinition, JourneyEdge, JourneyNode } from "@/domain/journey";

/**
 * The React Flow boundary.
 *
 * Everything above this file works with `JourneyDefinition`; everything below
 * it works with React Flow's `Node`/`Edge`. Keeping the translation in one
 * place is what stops canvas concerns leaking into the portable model.
 */

export interface FlowNodeData extends Record<string, unknown> {
  node: JourneyNode;
  /** Simulation overlay — undefined when no run is active. */
  simState?: "current" | "visited" | "idle";
  simOutcome?: string;
}

export type JourneyFlowNode = Node<FlowNodeData, "journeyNode">;
export type JourneyFlowEdge = Edge;

export interface SimulationOverlay {
  currentNodeId: string | null;
  visitedNodeIds: Set<string>;
  traversedEdgeIds: Set<string>;
  skippedEdgeIds: Set<string>;
  outcomeByNodeId: Map<string, string>;
}

export function toFlowNodes(
  journey: JourneyDefinition,
  selectedNodeId: string | null,
  overlay?: SimulationOverlay,
  previous?: JourneyFlowNode[],
): JourneyFlowNode[] {
  // React Flow writes measured dimensions onto the nodes it hands back. Those
  // must survive a rebuild: an unmeasured node is treated as uninitialised and
  // every edge touching it is silently dropped.
  const measured = new Map(previous?.map((node) => [node.id, node]));

  return journey.nodes.map((node) => {
    const prior = measured.get(node.id);
    return {
      ...prior,
      id: node.id,
      type: "journeyNode" as const,
      position: node.position,
      selected: node.id === selectedNodeId,
      data: {
        node,
        simState: overlay
          ? node.id === overlay.currentNodeId
            ? "current"
            : overlay.visitedNodeIds.has(node.id)
              ? "visited"
              : "idle"
          : undefined,
        simOutcome: overlay?.outcomeByNodeId.get(node.id),
      },
    };
  });
}

/**
 * Identifies everything about a journey that should force the canvas nodes to
 * be rebuilt. Positions are deliberately excluded — those are owned by React
 * Flow while dragging and committed back on drag stop.
 */
export function canvasSignature(
  journey: JourneyDefinition,
  selectedNodeId: string | null,
  overlay?: SimulationOverlay,
): string {
  const nodes = journey.nodes
    .map((node) => `${node.id}:${node.kind}:${node.label}:${JSON.stringify(node.config)}`)
    .join("|");
  const outcomes = overlay
    ? [...overlay.outcomeByNodeId.entries()].map(([id, outcome]) => `${id}=${outcome}`).join(",")
    : "";
  return `${nodes}::${selectedNodeId ?? ""}::${overlay?.currentNodeId ?? ""}::${outcomes}`;
}

export function toFlowEdges(
  journey: JourneyDefinition,
  overlay?: SimulationOverlay,
): JourneyFlowEdge[] {
  return journey.edges.map((edge) => {
    const traversed = overlay?.traversedEdgeIds.has(edge.id) ?? false;
    const skipped = overlay?.skippedEdgeIds.has(edge.id) ?? false;

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      label: edge.label,
      type: "smoothstep" as const,
      className: traversed ? "edge-traversed" : skipped ? "edge-skipped" : undefined,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: traversed ? "var(--accent)" : "var(--border-strong)",
      },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
    };
  });
}

/** Writes canvas-side position changes back into the canonical model. */
export function applyNodePositions(
  journey: JourneyDefinition,
  flowNodes: JourneyFlowNode[],
): JourneyDefinition {
  const positions = new Map(flowNodes.map((node) => [node.id, node.position]));
  return {
    ...journey,
    nodes: journey.nodes.map((node) => {
      const position = positions.get(node.id);
      return position ? { ...node, position } : node;
    }),
  };
}

export function edgeFromConnection(
  id: string,
  source: string,
  target: string,
  sourceHandle: string | null | undefined,
  label?: string,
): JourneyEdge {
  return { id, source, target, sourceHandle: sourceHandle ?? "out", label };
}
