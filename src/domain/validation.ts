import {
  NODE_KIND_META,
  ENTRY_KINDS,
  getNodeOutputs,
  isEntryKind,
  toJourneyKey,
  type JourneyDefinition,
  type JourneyEdge,
  type JourneyNode,
  type JourneyNodeKind,
} from "./journey";

export interface ValidationIssue {
  level: "error" | "warning";
  message: string;
  nodeId?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

const KNOWN_KINDS = new Set(Object.keys(NODE_KIND_META));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Structural parse used by Import JSON. Returns a typed definition only when
 * the payload is genuinely shaped like one — imported journeys must never be
 * able to put the builder into an unrenderable state.
 */
export function parseJourneyDefinition(
  raw: unknown,
): { ok: true; journey: JourneyDefinition } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!isRecord(raw)) {
    return { ok: false, errors: ["The file does not contain a JSON object."] };
  }

  if (typeof raw.name !== "string" || raw.name.trim() === "") {
    errors.push("`name` is required and must be a non-empty string.");
  }
  if (!Array.isArray(raw.nodes)) {
    errors.push("`nodes` is required and must be an array.");
  }
  if (!Array.isArray(raw.edges)) {
    errors.push("`edges` is required and must be an array.");
  }
  if (!isRecord(raw.trigger) || typeof raw.trigger.name !== "string") {
    errors.push("`trigger` is required and must include a `name`.");
  }

  if (errors.length > 0) return { ok: false, errors };

  const nodes = raw.nodes as unknown[];
  const parsedNodes: JourneyNode[] = [];
  const seenIds = new Set<string>();

  nodes.forEach((node, index) => {
    if (!isRecord(node)) {
      errors.push(`Node at index ${index} is not an object.`);
      return;
    }
    if (typeof node.id !== "string" || node.id === "") {
      errors.push(`Node at index ${index} is missing an \`id\`.`);
      return;
    }
    if (seenIds.has(node.id)) {
      errors.push(`Duplicate node id "${node.id}".`);
      return;
    }
    if (typeof node.kind !== "string" || !KNOWN_KINDS.has(node.kind)) {
      errors.push(`Node "${node.id}" has an unknown kind "${String(node.kind)}".`);
      return;
    }
    if (!isRecord(node.position) || typeof node.position.x !== "number" || typeof node.position.y !== "number") {
      errors.push(`Node "${node.id}" has an invalid \`position\`.`);
      return;
    }
    if (!isRecord(node.config)) {
      errors.push(`Node "${node.id}" is missing \`config\`.`);
      return;
    }

    seenIds.add(node.id);
    parsedNodes.push({
      id: node.id,
      kind: node.kind as JourneyNodeKind,
      label: typeof node.label === "string" ? node.label : NODE_KIND_META[node.kind as JourneyNodeKind].label,
      position: { x: node.position.x, y: node.position.y },
      config: node.config,
    } as JourneyNode);
  });

  const edges = raw.edges as unknown[];
  const parsedEdges: JourneyEdge[] = [];

  edges.forEach((edge, index) => {
    if (!isRecord(edge)) {
      errors.push(`Edge at index ${index} is not an object.`);
      return;
    }
    const { id, source, target } = edge;
    if (typeof id !== "string" || typeof source !== "string" || typeof target !== "string") {
      errors.push(`Edge at index ${index} must have string \`id\`, \`source\` and \`target\`.`);
      return;
    }
    if (!seenIds.has(source)) {
      errors.push(`Edge "${id}" references unknown source node "${source}".`);
      return;
    }
    if (!seenIds.has(target)) {
      errors.push(`Edge "${id}" references unknown target node "${target}".`);
      return;
    }
    parsedEdges.push({
      id,
      source,
      target,
      sourceHandle: typeof edge.sourceHandle === "string" ? edge.sourceHandle : "out",
      label: typeof edge.label === "string" ? edge.label : undefined,
    });
  });

  if (errors.length > 0) return { ok: false, errors };

  const trigger = raw.trigger as Record<string, unknown>;
  const now = new Date().toISOString();

  const journey: JourneyDefinition = {
    id: typeof raw.id === "string" ? raw.id : `journey_${Math.random().toString(36).slice(2, 9)}`,
    key: typeof raw.key === "string" && raw.key ? raw.key : toJourneyKey(raw.name as string),
    name: raw.name as string,
    description: typeof raw.description === "string" ? raw.description : undefined,
    version: typeof raw.version === "number" ? raw.version : 1,
    status: raw.status === "published" ? "published" : "draft",
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
    trigger: {
      type: trigger.type === "audience" ? "audience" : "event",
      name: trigger.name as string,
      description: typeof trigger.description === "string" ? trigger.description : undefined,
    },
    nodes: parsedNodes,
    edges: parsedEdges,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
    updatedAt: now,
  };

  return { ok: true, journey };
}

/**
 * Semantic checks surfaced in the builder. These are advisory: a journey can
 * be saved while incomplete, but cannot be published with errors outstanding.
 */
export function validateJourney(
  journey: JourneyDefinition,
  /** Known lineage keys, so dangling exclusion references surface as errors. */
  knownJourneyKeys?: string[],
): ValidationResult {
  const issues: ValidationIssue[] = [];

  for (const node of journey.nodes) {
    if (node.kind !== "exclusion_check") continue;

    if (!node.config.journeyKey) {
      issues.push({
        level: "error",
        message: `"${node.label}" does not reference a journey to exclude against.`,
        nodeId: node.id,
      });
      continue;
    }
    if (knownJourneyKeys && !knownJourneyKeys.includes(node.config.journeyKey)) {
      issues.push({
        level: "error",
        message: `"${node.label}" references unknown journey "${node.config.journeyKey}".`,
        nodeId: node.id,
      });
    }
    if (node.config.scope === "message" && !node.config.messageKey) {
      issues.push({
        level: "error",
        message: `"${node.label}" excludes on a specific message but no message is selected.`,
        nodeId: node.id,
      });
    }
  }

  const entryNodes = journey.nodes.filter((node) => isEntryKind(node.kind));
  if (entryNodes.length === 0) {
    issues.push({
      level: "error",
      message: `Add an entry node (${ENTRY_KINDS.map((k) => NODE_KIND_META[k].label).join(" or ")}) to start the journey.`,
    });
  } else if (entryNodes.length > 1) {
    issues.push({
      level: "warning",
      message: "Multiple entry nodes found — simulation will start from the first one.",
      nodeId: entryNodes[1].id,
    });
  }

  if (journey.nodes.every((node) => node.kind !== "exit")) {
    issues.push({
      level: "warning",
      message: "No Exit node — profiles will end the journey implicitly.",
    });
  }

  const incoming = new Map<string, number>();
  const outgoingByHandle = new Map<string, Set<string>>();

  for (const edge of journey.edges) {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    const handles = outgoingByHandle.get(edge.source) ?? new Set<string>();
    handles.add(edge.sourceHandle);
    outgoingByHandle.set(edge.source, handles);
  }

  for (const node of journey.nodes) {
    const meta = NODE_KIND_META[node.kind];

    if (meta.hasInput && !incoming.has(node.id)) {
      issues.push({
        level: "warning",
        message: `"${node.label}" is not connected to anything upstream.`,
        nodeId: node.id,
      });
    }

    const outputs = getNodeOutputs(node);
    if (outputs.length > 0) {
      const connected = outgoingByHandle.get(node.id) ?? new Set<string>();
      const missing = outputs.filter((output) => !connected.has(output.id));
      if (missing.length === outputs.length) {
        issues.push({
          level: "warning",
          message: `"${node.label}" has no outgoing connection.`,
          nodeId: node.id,
        });
      } else if (missing.length > 0) {
        issues.push({
          level: "warning",
          message: `"${node.label}" has an unconnected ${missing.map((m) => m.label || m.id).join(", ")} path.`,
          nodeId: node.id,
        });
      }
    }

    if (node.kind === "percentage_split") {
      const total = node.config.options.reduce((sum, option) => sum + option.percentage, 0);
      if (total !== 100) {
        issues.push({
          level: "error",
          message: `"${node.label}" splits total ${total}% — they must add up to 100%.`,
          nodeId: node.id,
        });
      }
    }
  }

  return { valid: issues.every((issue) => issue.level !== "error"), issues };
}
