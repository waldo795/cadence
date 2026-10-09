import type { CapEvaluation } from "@/domain/governance";
import type { ExperimentAssignment } from "@/domain/experiment";
import type { JourneyNodeKind, Channel } from "@/domain/journey";
import type { PolicyCode } from "@/services/ports";

export type StepOutcome =
  | "ENTERED"
  | "TRUE"
  | "FALSE"
  | "PASS"
  | "BLOCKED"
  | "SIMULATED"
  | "WAITING"
  | "MATCHED"
  | "UPDATED"
  | "CALLED"
  | "EXITED"
  | "CLEAR"
  | "EXCLUDED"
  | "WITHHELD"
  | "ROUTED"
  | "ERROR";

export const OUTCOME_TONE: Record<StepOutcome, "positive" | "negative" | "neutral" | "accent"> = {
  ENTERED: "accent",
  TRUE: "positive",
  FALSE: "negative",
  PASS: "positive",
  BLOCKED: "negative",
  SIMULATED: "accent",
  WAITING: "neutral",
  MATCHED: "positive",
  UPDATED: "accent",
  CALLED: "accent",
  EXITED: "neutral",
  CLEAR: "positive",
  EXCLUDED: "negative",
  WITHHELD: "neutral",
  ROUTED: "accent",
  ERROR: "negative",
};

/** A message the simulator would have sent, with both template and rendered form. */
export interface RenderedMessage {
  channel: Channel;
  template: string;
  subjectTemplate: string;
  subjectRendered: string;
  bodyTemplate: string;
  bodyRendered: string;
  unresolved: string[];
}

export interface PolicyTrace {
  code: PolicyCode;
  allowed: boolean;
  reason: string;
}

export interface SimulationStep {
  id: string;
  index: number;
  /**
   * Which journey this step ran in. A run can span more than one journey when
   * an experiment forks the profile elsewhere, and node ids are only unique
   * within a journey — the canvas overlay filters on this.
   */
  journeyId: string;
  journeyName: string;
  nodeId: string;
  nodeKind: JourneyNodeKind;
  nodeLabel: string;
  /** Virtual timestamp, ISO — advanced by waits rather than by real elapsed time. */
  virtualTime: string;
  /** Short verb phrase, e.g. "Condition evaluated". */
  title: string;
  /** The expression or value being acted on, rendered monospace. */
  detail?: string;
  outcome: StepOutcome;
  /** Why this outcome happened — the answer to "why did it take that path?". */
  explanation?: string;
  /** Outlet the run left this node through, used to highlight the traversed edge. */
  takenHandle?: string;
  traversedEdgeId?: string;
  message?: RenderedMessage;
  policy?: PolicyTrace;
  /** Cap resolution trace, attached to frequency and send steps. */
  cap?: CapEvaluation;
}

export type RunStatus = "completed" | "exited" | "blocked" | "waiting" | "error";

export interface SimulationRun {
  journeyId: string;
  journeyName: string;
  profileId: string;
  profileName: string;
  eventName: string;
  /** Present when a live experiment intercepted this entry. */
  assignment?: ExperimentAssignment;
  /** Set when the profile was routed out of the entry journey into a fork. */
  delegatedTo?: { journeyId: string; journeyKey: string; journeyName: string; version: number };
  /**
   * Present when the walk stopped at a Wait rather than finishing — the live
   * execution path. `resumeNodeId` is the node *after* the wait, because the
   * wait itself is complete once the clock reaches `wakeAt`.
   */
  suspended?: { resumeNodeId: string; wakeAt: string };
  /** Messages a holdout prevented — the measurement counterfactual. */
  withheldMessages: RenderedMessage[];
  startedAt: string;
  /** Virtual time at the end of the run. */
  endedAt: string;
  status: RunStatus;
  steps: SimulationStep[];
  /** Every node the run touched, in order. */
  visitedNodeIds: string[];
  traversedEdgeIds: string[];
  /** Edges leaving a visited node that were *not* taken — rendered as skipped. */
  skippedEdgeIds: string[];
  messages: RenderedMessage[];
  summary: string;
}

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  completed: "Completed",
  exited: "Exited",
  blocked: "Blocked by policy",
  waiting: "Waiting",
  error: "Error",
};

export const RUN_STATUS_TONE: Record<RunStatus, "positive" | "negative" | "neutral" | "warning"> = {
  completed: "positive",
  exited: "neutral",
  blocked: "negative",
  waiting: "warning",
  error: "negative",
};
