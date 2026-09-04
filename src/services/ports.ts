/**
 * Service boundaries.
 *
 * Every implementation in this PoC is local and synchronous-in-spirit, but the
 * signatures are async so that swapping in HTTP/Postgres/Kafka-backed versions
 * is a change of implementation only — never a change of caller.
 */

import type { CustomerEvent } from "@/domain/event";
import type { Channel, ConsentChannel, JourneyDefinition } from "@/domain/journey";
import type { MessageRecord } from "@/domain/message";
import type { JourneyParticipation } from "@/domain/participation";
import type { Profile } from "@/domain/profile";

export interface JourneyRepository {
  list(): Promise<JourneyDefinition[]>;
  get(id: string): Promise<JourneyDefinition | null>;
  save(journey: JourneyDefinition): Promise<JourneyDefinition>;
  duplicate(id: string): Promise<JourneyDefinition | null>;
  remove(id: string): Promise<void>;
  /**
   * Archives `id` and returns a fresh draft sharing its lineage key. Inbound
   * exclusion references resolve by key, so they follow the new version without
   * being rewritten.
   */
  createNewVersion(id: string): Promise<JourneyDefinition | null>;
  /** Copies a journey as a published experiment variant. */
  createExperimentFork(id: string, name: string): Promise<JourneyDefinition | null>;
  /** Journeys whose exclusion nodes point at the given lineage key. */
  referencesTo(key: string): Promise<JourneyDefinition[]>;
}

/**
 * Resolves a lineage key to whichever version is currently live. Separated from
 * the repository because the execution path only ever needs this narrow view.
 */
export interface JourneyDirectory {
  resolve(key: string): import("@/domain/journey").JourneyReference | null;
  list(): import("@/domain/journey").JourneyReference[];
}

export interface ExperimentRepository {
  list(): Promise<import("@/domain/experiment").Experiment[]>;
  get(id: string): Promise<import("@/domain/experiment").Experiment | null>;
  save(experiment: import("@/domain/experiment").Experiment): Promise<import("@/domain/experiment").Experiment>;
  remove(id: string): Promise<void>;
}

/**
 * The runtime lookup a journey performs on entry: "is an experiment live for
 * me?". Deliberately narrow and synchronous — the execution path should not
 * have to know how experiments are stored or edited.
 */
export interface ExperimentDirectory {
  findLiveForJourney(journeyKey: string): import("@/domain/experiment").Experiment | null;
  listForJourney(journeyKey: string): import("@/domain/experiment").Experiment[];
}

export interface ContactPolicyRepository {
  get(): Promise<import("@/domain/governance").ContactPolicy>;
  save(policy: import("@/domain/governance").ContactPolicy): Promise<void>;
}

/**
 * Air traffic control. Owns how often a profile may be contacted, independently
 * of any journey, so one change protects every journey at once.
 */
export interface FrequencyGovernor {
  resolveCap(
    profile: Profile,
    channel: Channel,
  ): import("@/domain/governance").CapEvaluation;
}

export interface ProfileFilter {
  query?: string;
  loyaltyTier?: string;
  appInstalled?: boolean;
  country?: string;
}

export interface ProfileRepository {
  list(filter?: ProfileFilter): Promise<Profile[]>;
  get(id: string): Promise<Profile | null>;
}

export interface EventRepository {
  listForProfile(profileId: string): Promise<CustomerEvent[]>;
  listRecent(limit?: number): Promise<CustomerEvent[]>;
}

export interface MessageRepository {
  listForProfile(profileId: string): Promise<MessageRecord[]>;
}

export interface ParticipationRepository {
  listForProfile(profileId: string): Promise<JourneyParticipation[]>;
  countForJourney(journeyId: string): Promise<number>;
}

/* -------------------------------------------------------------------------- */
/* Channels                                                                   */
/* -------------------------------------------------------------------------- */

export interface OutboundMessage {
  channel: Channel;
  profileId: string;
  template: string;
  subject: string;
  body: string;
}

export interface DeliveryResult {
  status: "simulated" | "sent" | "failed";
  providerId: string;
  detail: string;
}

/**
 * The seam an SES/FCM/Twilio adapter would slot into. The PoC ships a single
 * simulating provider that records what *would* have been sent.
 */
export interface ChannelProvider {
  readonly channel: Channel;
  readonly providerName: string;
  send(message: OutboundMessage): Promise<DeliveryResult>;
}

/* -------------------------------------------------------------------------- */
/* Policy                                                                     */
/* -------------------------------------------------------------------------- */

export type PolicyCode =
  | "ALLOWED"
  | "NO_CONSENT"
  | "GLOBALLY_SUPPRESSED"
  | "NO_PUSH_TOKEN"
  | "FREQUENCY_CAP"
  | "CONTROL_HOLDBACK"
  | "EXCLUDED";

export interface PolicyRequest {
  profile: Profile;
  channel: ConsentChannel;
  purpose: string;
  /** Messages already sent to this profile during the current simulation run. */
  messagesSentInWindow: number;
  /** Resolved by the frequency governor; absent means consent-only evaluation. */
  cap?: import("@/domain/governance").CapEvaluation;
  /**
   * Set when the profile is in an experiment's control group. Checked before
   * everything else: a held-out profile must never receive a communication,
   * however many times they re-enter the journey.
   */
  heldOut?: boolean;
}

export interface PolicyDecision {
  allowed: boolean;
  code: PolicyCode;
  reason: string;
}

export interface PolicyEvaluator {
  evaluate(request: PolicyRequest): PolicyDecision;
}

/* -------------------------------------------------------------------------- */
/* Execution                                                                  */
/* -------------------------------------------------------------------------- */

export interface ExecutionRequest {
  journey: JourneyDefinition;
  profile: Profile;
  event: CustomerEvent;
  /**
   * Prior sends for this profile. Exclusion nodes and frequency caps both read
   * it, and the run appends its own simulated sends so later nodes in the same
   * journey see them too.
   */
  messageHistory?: MessageRecord[];
  /** Resolves lineage keys to the live journey version, for trace readability. */
  directory?: JourneyDirectory;
  /** Overrides the workspace contact policy — used by the governance preview. */
  governor?: FrequencyGovernor;
  /**
   * Consulted at entry. When a live experiment targets this journey the profile
   * may be routed into a fork journey or held out entirely.
   */
  experiments?: ExperimentDirectory;
  /** Resolves a fork's lineage key to a runnable definition. */
  resolveJourney?: (journeyKey: string) => JourneyDefinition | null;
  /** Internal: guards against a fork chain looping back on itself. */
  delegationDepth?: number;
}

/**
 * In production this is a durable workflow (Temporal or equivalent). Here it is
 * a pure function that returns the whole trace at once, which is what makes
 * stepping, restarting and virtual time trivial in the UI.
 */
export interface JourneyExecutor {
  run(request: ExecutionRequest): import("@/simulation/types").SimulationRun;
}
