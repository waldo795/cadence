/**
 * The canonical journey model.
 *
 * This file deliberately has no React and no React Flow imports. The canvas is
 * only ever a *view* over these structures, which is what makes a journey
 * portable enough to be generated, versioned, validated, simulated or shipped
 * over an API later on.
 */

export type JourneyStatus = "draft" | "published" | "archived";

export type NodeCategory = "entry" | "logic" | "action" | "control";

export type JourneyNodeKind =
  | "event_trigger"
  | "audience_entry"
  | "condition"
  | "branch"
  | "wait"
  | "wait_until"
  | "percentage_split"
  | "send_email"
  | "send_push"
  | "webhook"
  | "update_profile"
  | "frequency_check"
  | "consent_check"
  | "exclusion_check"
  | "exit";

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "less_than"
  | "exists"
  | "not_exists";

export const CONDITION_OPERATOR_LABELS: Record<ConditionOperator, string> = {
  equals: "equals",
  not_equals: "does not equal",
  contains: "contains",
  greater_than: "is greater than",
  less_than: "is less than",
  exists: "exists",
  not_exists: "does not exist",
};

/** Operators that compare against nothing — the value input is hidden for these. */
export const UNARY_OPERATORS: ConditionOperator[] = ["exists", "not_exists"];

export const CONDITION_OPERATOR_SYMBOLS: Record<ConditionOperator, string> = {
  equals: "==",
  not_equals: "!=",
  contains: "contains",
  greater_than: ">",
  less_than: "<",
  exists: "exists",
  not_exists: "not exists",
};

export type Channel = "email" | "push" | "sms";

/**
 * A consent gate may check one channel, or marketing reachability in general.
 * "any" exists because a journey often needs to know a customer is contactable
 * *before* it decides which channel to use.
 */
export type ConsentChannel = Channel | "any";

export type WaitUnit = "minutes" | "hours" | "days";

export interface Position {
  x: number;
  y: number;
}

/* -------------------------------------------------------------------------- */
/* Node configuration                                                         */
/* -------------------------------------------------------------------------- */

export interface EventTriggerConfig {
  eventName: string;
  description?: string;
}

export interface AudienceEntryConfig {
  audienceName: string;
  description?: string;
}

export interface ConditionConfig {
  field: string;
  operator: ConditionOperator;
  value: string;
}

export interface BranchOption {
  id: string;
  label: string;
  field: string;
  operator: ConditionOperator;
  value: string;
}

export interface BranchConfig {
  options: BranchOption[];
}

export interface WaitConfig {
  duration: number;
  unit: WaitUnit;
}

export interface WaitUntilConfig {
  /** e.g. `event.fixture.startTime - 48 hours`. Parsed by the simulator. */
  expression: string;
}

export interface SplitOption {
  id: string;
  label: string;
  percentage: number;
}

export interface PercentageSplitConfig {
  options: SplitOption[];
}

export interface SendEmailConfig {
  template: string;
  senderName: string;
  subject: string;
  /**
   * The plain-text body.
   *
   * Still the source of truth for a node that has never been opened in the
   * block editor, and still what the plain-text part is built from. Read it
   * through `blocksFor()` rather than directly.
   */
  body: string;
  /**
   * The designed body. Absent on nodes authored before the editor existed,
   * which is why `blocksFor()` derives blocks from `body` when it is missing.
   */
  blocks?: import("./email-content").EmailBlock[];
  /** The inbox preview line. Falls back to the first paragraph. */
  preheader?: string;
  /**
   * Stable identifier other journeys exclude against. Kept separate from
   * `template` so copy can be renamed without breaking every reference to it.
   */
  messageKey: string;
}

export interface SendPushConfig {
  template: string;
  title: string;
  body: string;
  messageKey: string;
}

export interface WebhookConfig {
  url: string;
  method: "GET" | "POST" | "PUT";
  description?: string;
}

export interface UpdateProfileConfig {
  attribute: string;
  value: string;
}

export interface FrequencyCheckConfig {
  /**
   * "governed" defers to the workspace contact policy, which is the default so
   * that a central change protects every journey at once. "local" lets a single
   * journey be stricter — never more permissive; the governed cap still clamps.
   */
  mode: "governed" | "local";
  channel: Channel;
  maxMessages: number;
  windowDays: number;
}

export type ExclusionScope = "journey" | "message";

export interface ExclusionCheckConfig {
  scope: ExclusionScope;
  /**
   * A journey *lineage* key, never a version id. Rebuilding the referenced
   * journey as a new version therefore keeps this reference pointing at
   * whatever the live version is.
   */
  journeyKey: string;
  /** Required when scope is "message". */
  messageKey?: string;
  withinDays: number;
  channel: ConsentChannel;
}

export interface ConsentCheckConfig {
  channel: ConsentChannel;
  purpose: string;
}

export interface ExitConfig {
  reason?: string;
}

export interface NodeConfigByKind {
  event_trigger: EventTriggerConfig;
  audience_entry: AudienceEntryConfig;
  condition: ConditionConfig;
  branch: BranchConfig;
  wait: WaitConfig;
  wait_until: WaitUntilConfig;
  percentage_split: PercentageSplitConfig;
  send_email: SendEmailConfig;
  send_push: SendPushConfig;
  webhook: WebhookConfig;
  update_profile: UpdateProfileConfig;
  frequency_check: FrequencyCheckConfig;
  consent_check: ConsentCheckConfig;
  exclusion_check: ExclusionCheckConfig;
  exit: ExitConfig;
}

export type JourneyNode = {
  [K in JourneyNodeKind]: {
    id: string;
    kind: K;
    label: string;
    position: Position;
    config: NodeConfigByKind[K];
  };
}[JourneyNodeKind];

export type NodeOfKind<K extends JourneyNodeKind> = Extract<JourneyNode, { kind: K }>;

export interface JourneyEdge {
  id: string;
  source: string;
  target: string;
  /** Which outlet the edge leaves from — `true`/`false`, `pass`/`blocked`, a split id, or `out`. */
  sourceHandle: string;
  label?: string;
}

export interface JourneyTrigger {
  type: "event" | "audience";
  /** Event name for `event` triggers, audience name for `audience` triggers. */
  name: string;
  description?: string;
}

export interface JourneyDefinition {
  id: string;
  /**
   * Stable lineage key, shared by every version of this journey. Other journeys
   * reference *this*, never `id`, so stopping a journey and rebuilding it as a
   * new version keeps inbound exclusion references pointing at the live one.
   */
  key: string;
  name: string;
  description?: string;
  version: number;
  status: JourneyStatus;
  tags: string[];
  trigger: JourneyTrigger;
  nodes: JourneyNode[];
  edges: JourneyEdge[];
  /**
   * Marks a journey created as an experiment fork. Purely informational — the
   * experiment record is the source of truth for what is under test.
   */
  forkOfJourneyKey?: string;
  /** The journey id this version replaced, if it was rebuilt from one. */
  supersedesId?: string;
  /** Set on the old version when it is superseded. */
  supersededById?: string;
  createdAt: string;
  updatedAt: string;
}

/** A journey identified by lineage rather than by version, for reference UIs. */
export interface JourneyReference {
  key: string;
  id: string;
  name: string;
  version: number;
  status: JourneyStatus;
}

/** Slugifies a name into a readable, stable lineage key. */
export function toJourneyKey(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `journey-${Math.random().toString(36).slice(2, 8)}`;
}

/* -------------------------------------------------------------------------- */
/* Node metadata — the single source of truth for labels, icons and outlets    */
/* -------------------------------------------------------------------------- */

export interface NodeHandleSpec {
  id: string;
  label: string;
  tone: "neutral" | "positive" | "negative";
}

export interface NodeKindMeta {
  kind: JourneyNodeKind;
  category: NodeCategory;
  label: string;
  description: string;
  /** lucide-react icon name, resolved in the UI layer to keep this file React-free. */
  icon: string;
  hasInput: boolean;
  /** Static outlets. Dynamic-outlet kinds (branch, split) return `[]` here. */
  outputs: NodeHandleSpec[];
  dynamicOutputs?: "branch" | "percentage_split";
}

const OUT: NodeHandleSpec[] = [{ id: "out", label: "", tone: "neutral" }];

export const NODE_KIND_META: Record<JourneyNodeKind, NodeKindMeta> = {
  event_trigger: {
    kind: "event_trigger",
    category: "entry",
    label: "Event Trigger",
    description: "Start the journey when an event is received",
    icon: "Zap",
    hasInput: false,
    outputs: OUT,
  },
  audience_entry: {
    kind: "audience_entry",
    category: "entry",
    label: "Audience Entry",
    description: "Start the journey for members of an audience",
    icon: "Users",
    hasInput: false,
    outputs: OUT,
  },
  condition: {
    kind: "condition",
    category: "logic",
    label: "Condition",
    description: "Split the path on a profile or event attribute",
    icon: "GitBranch",
    hasInput: true,
    outputs: [
      { id: "true", label: "TRUE", tone: "positive" },
      { id: "false", label: "FALSE", tone: "negative" },
    ],
  },
  branch: {
    kind: "branch",
    category: "logic",
    label: "Branch",
    description: "Route down the first matching branch",
    icon: "Split",
    hasInput: true,
    outputs: [],
    dynamicOutputs: "branch",
  },
  wait: {
    kind: "wait",
    category: "logic",
    label: "Wait",
    description: "Pause for a fixed duration",
    icon: "Clock",
    hasInput: true,
    outputs: OUT,
  },
  wait_until: {
    kind: "wait_until",
    category: "logic",
    label: "Wait Until Date",
    description: "Pause until a point in time relative to the context",
    icon: "CalendarClock",
    hasInput: true,
    outputs: OUT,
  },
  percentage_split: {
    kind: "percentage_split",
    category: "logic",
    label: "Percentage Split",
    description: "Randomly allocate profiles across weighted paths",
    icon: "Percent",
    hasInput: true,
    outputs: [],
    dynamicOutputs: "percentage_split",
  },
  send_email: {
    kind: "send_email",
    category: "action",
    label: "Send Email",
    description: "Deliver an email through the configured provider",
    icon: "Mail",
    hasInput: true,
    outputs: OUT,
  },
  send_push: {
    kind: "send_push",
    category: "action",
    label: "Send Push",
    description: "Deliver a push notification to the mobile app",
    icon: "Smartphone",
    hasInput: true,
    outputs: OUT,
  },
  webhook: {
    kind: "webhook",
    category: "action",
    label: "Webhook",
    description: "Call an external HTTP endpoint",
    icon: "Webhook",
    hasInput: true,
    outputs: OUT,
  },
  update_profile: {
    kind: "update_profile",
    category: "action",
    label: "Update Profile",
    description: "Write an attribute back to the profile",
    icon: "UserPen",
    hasInput: true,
    outputs: OUT,
  },
  frequency_check: {
    kind: "frequency_check",
    category: "control",
    label: "Frequency Check",
    description: "Enforce a marketing frequency cap",
    icon: "Gauge",
    hasInput: true,
    outputs: [
      { id: "pass", label: "PASS", tone: "positive" },
      { id: "blocked", label: "BLOCKED", tone: "negative" },
    ],
  },
  consent_check: {
    kind: "consent_check",
    category: "control",
    label: "Consent Check",
    description: "Verify channel consent before messaging",
    icon: "ShieldCheck",
    hasInput: true,
    outputs: [
      { id: "pass", label: "PASS", tone: "positive" },
      { id: "fail", label: "FAIL", tone: "negative" },
    ],
  },
  exclusion_check: {
    kind: "exclusion_check",
    category: "control",
    label: "Exclusion Check",
    description: "Suppress if the profile was already contacted by another journey",
    icon: "Ban",
    hasInput: true,
    outputs: [
      { id: "clear", label: "CLEAR", tone: "positive" },
      { id: "excluded", label: "EXCLUDED", tone: "negative" },
    ],
  },
  exit: {
    kind: "exit",
    category: "control",
    label: "Exit",
    description: "End the journey for this profile",
    icon: "CircleStop",
    hasInput: true,
    outputs: [],
  },
};

export const NODE_CATEGORY_META: Record<
  NodeCategory,
  { label: string; colorVar: string }
> = {
  entry: { label: "Entry", colorVar: "var(--node-entry)" },
  logic: { label: "Logic", colorVar: "var(--node-logic)" },
  action: { label: "Action", colorVar: "var(--node-action)" },
  control: { label: "Control", colorVar: "var(--node-control)" },
};

export const ENTRY_KINDS: JourneyNodeKind[] = ["event_trigger", "audience_entry"];

export function isEntryKind(kind: JourneyNodeKind): boolean {
  return ENTRY_KINDS.includes(kind);
}

/** Resolves the outlets a node exposes, expanding the dynamic-outlet kinds. */
export function getNodeOutputs(node: JourneyNode): NodeHandleSpec[] {
  const meta = NODE_KIND_META[node.kind];
  if (meta.dynamicOutputs === "branch") {
    const config = node.config as BranchConfig;
    return [
      ...config.options.map((option) => ({
        id: option.id,
        label: option.label,
        tone: "neutral" as const,
      })),
      { id: "default", label: "Default", tone: "negative" as const },
    ];
  }
  if (meta.dynamicOutputs === "percentage_split") {
    const config = node.config as PercentageSplitConfig;
    return config.options.map((option) => ({
      id: option.id,
      label: `${option.label} · ${option.percentage}%`,
      tone: "neutral" as const,
    }));
  }
  return meta.outputs;
}

/* -------------------------------------------------------------------------- */
/* Factories                                                                  */
/* -------------------------------------------------------------------------- */

export function createNodeId(kind: JourneyNodeKind): string {
  return `${kind}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createEdgeId(): string {
  return `edge_${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultConfigFor<K extends JourneyNodeKind>(
  kind: K,
): NodeConfigByKind[K] {
  switch (kind) {
    case "event_trigger":
      return { eventName: "custom.event", description: "" } satisfies EventTriggerConfig as NodeConfigByKind[K];
    case "audience_entry":
      return { audienceName: "All customers", description: "" } satisfies AudienceEntryConfig as NodeConfigByKind[K];
    case "condition":
      return {
        field: "profile.appInstalled",
        operator: "equals",
        value: "true",
      } satisfies ConditionConfig as NodeConfigByKind[K];
    case "branch":
      return {
        options: [
          { id: "branch_a", label: "Gold", field: "profile.loyaltyTier", operator: "equals", value: "Gold" },
          { id: "branch_b", label: "Silver", field: "profile.loyaltyTier", operator: "equals", value: "Silver" },
        ],
      } satisfies BranchConfig as NodeConfigByKind[K];
    case "wait":
      return { duration: 2, unit: "hours" } satisfies WaitConfig as NodeConfigByKind[K];
    case "wait_until":
      return {
        expression: "event.fixture.startTime - 48 hours",
      } satisfies WaitUntilConfig as NodeConfigByKind[K];
    case "percentage_split":
      return {
        options: [
          { id: "split_a", label: "Variant A", percentage: 50 },
          { id: "split_b", label: "Variant B", percentage: 50 },
        ],
      } satisfies PercentageSplitConfig as NodeConfigByKind[K];
    case "send_email":
      return {
        template: "untitled-email",
        senderName: "Northgate FC",
        subject: "Hi {{profile.firstName}}",
        body: "Hi {{profile.firstName}}, here is your update.",
        messageKey: "untitled-email",
      } satisfies SendEmailConfig as NodeConfigByKind[K];
    case "send_push":
      return {
        template: "untitled-push",
        title: "Hi {{profile.firstName}}",
        body: "Tap to see the latest.",
        messageKey: "untitled-push",
      } satisfies SendPushConfig as NodeConfigByKind[K];
    case "webhook":
      return {
        url: "https://api.example.test/hooks/journey",
        method: "POST",
        description: "",
      } satisfies WebhookConfig as NodeConfigByKind[K];
    case "update_profile":
      return {
        attribute: "profile.lastJourney",
        value: "{{journey.name}}",
      } satisfies UpdateProfileConfig as NodeConfigByKind[K];
    case "frequency_check":
      return {
        mode: "governed",
        channel: "email",
        maxMessages: 3,
        windowDays: 7,
      } satisfies FrequencyCheckConfig as NodeConfigByKind[K];
    case "consent_check":
      return { channel: "push", purpose: "Marketing" } satisfies ConsentCheckConfig as NodeConfigByKind[K];
    case "exclusion_check":
      return {
        scope: "journey",
        journeyKey: "",
        withinDays: 7,
        channel: "any",
      } satisfies ExclusionCheckConfig as NodeConfigByKind[K];
    case "exit":
      return { reason: "Journey complete" } satisfies ExitConfig as NodeConfigByKind[K];
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled node kind: ${String(exhaustive)}`);
    }
  }
}

export function createNode(kind: JourneyNodeKind, position: Position): JourneyNode {
  return {
    id: createNodeId(kind),
    kind,
    label: NODE_KIND_META[kind].label,
    position,
    config: defaultConfigFor(kind),
  } as JourneyNode;
}

/** Finds the node a simulation should start from. */
export function findEntryNode(journey: JourneyDefinition): JourneyNode | undefined {
  return journey.nodes.find((node) => isEntryKind(node.kind));
}
