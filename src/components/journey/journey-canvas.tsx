"use client";

import * as React from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type NodeChange,
  type OnSelectionChangeParams,
  applyNodeChanges,
} from "@xyflow/react";
import {
  NODE_CATEGORY_META,
  NODE_KIND_META,
  type JourneyDefinition,
  type JourneyNodeKind,
} from "@/domain/journey";
import { JourneyNodeView } from "./journey-node";
import { NODE_DRAG_TYPE } from "./node-library";
import {
  applyNodePositions,
  canvasSignature,
  toFlowEdges,
  toFlowNodes,
  type JourneyFlowNode,
  type SimulationOverlay,
} from "./flow-mapping";

const nodeTypes = { journeyNode: JourneyNodeView };

interface JourneyCanvasProps {
  journey: JourneyDefinition;
  selectedNodeId: string | null;
  overlay?: SimulationOverlay;
  /** Locked while a simulation is being stepped through. */
  readOnly?: boolean;
  onSelectNode: (nodeId: string | null) => void;
  onNodesMoved: (journey: JourneyDefinition) => void;
  onConnect: (connection: Connection) => void;
  onDropNode: (kind: JourneyNodeKind, position: { x: number; y: number }) => void;
  onDeleteNodes: (nodeIds: string[]) => void;
  onDeleteEdges: (edgeIds: string[]) => void;
}

function CanvasInner({
  journey,
  selectedNodeId,
  overlay,
  readOnly = false,
  onSelectNode,
  onNodesMoved,
  onConnect,
  onDropNode,
  onDeleteNodes,
  onDeleteEdges,
}: JourneyCanvasProps) {
  const wrapper = React.useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  // React Flow owns the node array while the canvas is live: it writes measured
  // dimensions and drag positions into it, and both are required for edges to
  // render. The journey definition remains the source of truth for *structure*,
  // and is re-applied whenever the signature below changes.
  const [flowNodes, setFlowNodes] = React.useState<JourneyFlowNode[]>(() =>
    toFlowNodes(journey, selectedNodeId, overlay),
  );

  const signature = canvasSignature(journey, selectedNodeId, overlay);
  const [appliedSignature, setAppliedSignature] = React.useState(signature);
  if (appliedSignature !== signature) {
    // Adjusting state during render — the documented alternative to a syncing
    // effect (react.dev/learn/you-might-not-need-an-effect).
    setAppliedSignature(signature);
    setFlowNodes((current) => toFlowNodes(journey, selectedNodeId, overlay, current));
  }

  const flowEdges = React.useMemo(() => toFlowEdges(journey, overlay), [journey, overlay]);

  const handleNodesChange = React.useCallback(
    (changes: NodeChange<JourneyFlowNode>[]) => {
      // Applied unconditionally: `dimensions` changes carry the measurements
      // React Flow needs before it will draw any edge.
      setFlowNodes((current) => applyNodeChanges(changes, current));

      if (readOnly) return;
      const removals = changes
        .filter((change) => change.type === "remove")
        .map((change) => change.id);
      if (removals.length > 0) onDeleteNodes(removals);
    },
    [onDeleteNodes, readOnly],
  );

  // Positions are committed once the drag ends rather than on every frame.
  const commitPositions = React.useCallback(() => {
    onNodesMoved(applyNodePositions(journey, flowNodes));
  }, [journey, flowNodes, onNodesMoved]);

  const handleSelectionChange = React.useCallback(
    ({ nodes }: OnSelectionChangeParams) => {
      onSelectNode(nodes.length === 1 ? nodes[0].id : null);
    },
    [onSelectNode],
  );

  const handleDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData(NODE_DRAG_TYPE) as JourneyNodeKind;
      if (!kind || !NODE_KIND_META[kind]) return;

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      // Drop so the cursor lands near the node's centre, not its corner.
      onDropNode(kind, { x: position.x - 124, y: position.y - 40 });
    },
    [screenToFlowPosition, onDropNode],
  );

  // Fit the journey on first paint so a seeded journey is readable immediately.
  React.useEffect(() => {
    const timeout = setTimeout(() => void fitView({ padding: 0.18, duration: 300 }), 60);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey.id]);

  return (
    <div ref={wrapper} className="relative h-full flex-1">
      <ReactFlow<JourneyFlowNode>
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onNodeDragStop={readOnly ? undefined : commitPositions}
        onConnect={readOnly ? undefined : onConnect}
        onSelectionChange={handleSelectionChange}
        onEdgesDelete={
          readOnly ? undefined : (edges) => onDeleteEdges(edges.map((edge) => edge.id))
        }
        onDrop={readOnly ? undefined : handleDrop}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onPaneClick={() => onSelectNode(null)}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable
        deleteKeyCode={readOnly ? null : ["Delete", "Backspace"]}
        proOptions={{ hideAttribution: false }}
        minZoom={0.2}
        maxZoom={1.75}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        defaultEdgeOptions={{ type: "smoothstep" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1}
          color="var(--border-strong)"
        />
        <Controls
          position="bottom-left"
          showInteractive={false}
          className="!m-3 !overflow-hidden !rounded-lg !border !border-border !shadow-sm"
        />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          className="!m-3"
          maskColor="color-mix(in oklab, var(--surface-muted) 78%, transparent)"
          nodeColor={(node) => {
            const data = node.data as JourneyFlowNode["data"];
            const category = NODE_KIND_META[data.node.kind].category;
            return NODE_CATEGORY_META[category].colorVar;
          }}
          nodeStrokeWidth={0}
          style={{ width: 150, height: 100 }}
        />
      </ReactFlow>
    </div>
  );
}

export function JourneyCanvas(props: JourneyCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
