import { resolveJourneyByKey } from "@/domain/exclusion";
import { resolveCap, type ContactPolicy } from "@/domain/governance";
import type { CustomerEvent } from "@/domain/event";
import { assignProfile, isLive, type Experiment } from "@/domain/experiment";
import {
  MAX_INSTANCE_STEPS,
  type InstanceStatus,
  type JourneyInstance,
} from "@/domain/instance";
import type { JourneyDefinition, JourneyReference } from "@/domain/journey";
import type { MessageRecord } from "@/domain/message";
import type { Profile } from "@/domain/profile";
import type { FrequencyGovernor } from "@/services/ports";
import { simulationEngine } from "@/simulation/engine";
import type { RenderedMessage, SimulationRun } from "@/simulation/types";
import { DOCUMENT_KEYS } from "@/shared/keys";
import { activeInstance, dueInstances, saveInstance } from "./instances";
import {
  insertMessages,
  listProfiles,
  readDocument,
  getProfile,
  listMessages,
} from "./store";

/**
 * The runner — the live execution path.
 *
 * It uses the same engine the simulator does, with two differences passed in
 * as options: the real clock instead of a virtual one, and `waitMode:
 * "suspend"` so a Wait node stops the walk rather than fast-forwarding
 * through it. Nothing about the decision logic is duplicated, which is what
 * stops a preview and a live run disagreeing.
 *
 * Each call advances an instance as far as it can go and then persists where
 * it stopped. Progress is therefore durable across restarts, deploys and
 * however long the gap between slices turns out to be.
 */

export interface RunnerOptions {
  now?: Date;
  /**
   * When false, the runner decides everything and records what it *would*
   * send without creating message records. Used by the dry run.
   */
  commit?: boolean;
}

export interface SliceResult {
  instance: JourneyInstance;
  run: SimulationRun;
  /** Messages this slice decided to send. */
  sends: RenderedMessage[];
}

/* -------------------------------------------------------------------------- */
/* Shared context                                                             */
/* -------------------------------------------------------------------------- */

async function loadContext() {
  const journeys = (await readDocument<JourneyDefinition[]>(DOCUMENT_KEYS.journeys)) ?? [];
  const experiments = (await readDocument<Experiment[]>(DOCUMENT_KEYS.experiments)) ?? [];
  const messages = await listMessages();

  /*
   * A server-side contact governor.
   *
   * The engine's default governor is the browser one, which reads the cache
   * the client hydrates at start-up — there is no such cache here, so leaving
   * it to the default throws the moment a send node is reached. Building it
   * from the policy document keeps the live path on the same `resolveCap`
   * logic the UI previews with, without dragging in any client module.
   */
  const policy = (await readDocument<ContactPolicy>(DOCUMENT_KEYS.contactPolicy)) ?? {
    ceilingMaxMessages: 7,
    ceilingWindowDays: 7,
    rules: [],
  };
  const governor: FrequencyGovernor = {
    resolveCap: (profile, channel) => resolveCap(policy, profile, channel),
  };

  return {
    journeys,
    governor,
    directory: {
      resolve: (key: string): JourneyReference | null =>
        resolveJourneyByKey(key, journeys),
      list: (): JourneyReference[] => [],
    },
    experiments: {
      findLiveForJourney: (key: string): Experiment | null =>
        experiments.find((item) => item.targetJourneyKey === key && isLive(item)) ?? null,
      listForJourney: (key: string): Experiment[] =>
        experiments.filter((item) => item.targetJourneyKey === key),
    },
    resolveJourney: (key: string): JourneyDefinition | null => {
      const reference = resolveJourneyByKey(key, journeys);
      return journeys.find((journey) => journey.id === reference?.id) ?? null;
    },
    messagesFor: (profileId: string): MessageRecord[] =>
      messages.filter((message) => message.profileId === profileId),
  };
}

type RunContext = Awaited<ReturnType<typeof loadContext>>;

/** Maps where the engine stopped onto a durable instance status. */
function statusFromRun(run: SimulationRun): InstanceStatus {
  if (run.suspended) return "waiting";
  if (run.status === "error") return "failed";
  if (run.status === "exited" || run.status === "blocked") return "exited";
  return "completed";
}

/** Turns what the engine decided to send into durable records. */
function toMessageRecords(
  run: SimulationRun,
  instance: JourneyInstance,
  now: Date,
): MessageRecord[] {
  return run.messages.map((message, index) => ({
    id: `msg_${instance.id}_${instance.stepCount}_${index}`,
    profileId: instance.profileId,
    channel: message.channel,
    template: message.template,
    messageKey: message.template,
    subject: message.subjectRendered,
    body: message.bodyRendered,
    // Still "simulated": nothing is delivered until the provider adapters
    // exist. The decision and its audit trail are real; the send is not.
    status: "simulated" as const,
    sentAt: now.toISOString(),
    journeyId: instance.journeyId,
    journeyKey: instance.journeyKey,
    journeyName: instance.journeyName,
  }));
}

/* -------------------------------------------------------------------------- */
/* Advancing one instance                                                     */
/* -------------------------------------------------------------------------- */

async function advance(
  instance: JourneyInstance,
  profile: Profile,
  journey: JourneyDefinition,
  context: RunContext,
  options: RunnerOptions,
): Promise<SliceResult> {
  const now = options.now ?? new Date();
  const commit = options.commit !== false;

  /*
   * The event's timestamp is moved to now before resuming.
   *
   * The engine starts its clock from the event, and the event could be months
   * old by the time a later slice runs. Without this, a "wait 24 hours" after
   * a three-month countdown would compute a wake time already long past.
   */
  const event: CustomerEvent = {
    ...instance.context,
    occurredAt: now.toISOString(),
  };

  const run = simulationEngine.run({
    journey,
    profile,
    event,
    messageHistory: context.messagesFor(profile.id),
    directory: context.directory,
    experiments: context.experiments,
    resolveJourney: context.resolveJourney,
    governor: context.governor,
    // The live path: resume where we stopped, keep the frozen variant, and
    // suspend rather than fast-forward through waits.
    startNodeId: instance.currentNodeId ?? undefined,
    assignment: instance.assignment,
    waitMode: "suspend",
  });

  const status = statusFromRun(run);
  const stepCount = instance.stepCount + run.steps.length;

  const next: JourneyInstance = {
    ...instance,
    status:
      stepCount > MAX_INSTANCE_STEPS && status === "waiting" ? "failed" : status,
    currentNodeId: run.suspended?.resumeNodeId ?? null,
    wakeAt: run.suspended?.wakeAt ?? null,
    updatedAt: now.toISOString(),
    completedAt: run.suspended ? null : now.toISOString(),
    stepCount,
    lastError:
      run.status === "error"
        ? run.summary
        : stepCount > MAX_INSTANCE_STEPS
          ? `Stopped after ${MAX_INSTANCE_STEPS} steps across resumptions — the journey appears to loop.`
          : undefined,
  };

  if (commit) {
    const records = toMessageRecords(run, next, now);
    if (records.length > 0) await insertMessages(records);
    await saveInstance(next);
  }

  return { instance: next, run, sends: run.messages };
}

/* -------------------------------------------------------------------------- */
/* Entry points                                                               */
/* -------------------------------------------------------------------------- */

export interface StartResult {
  started: SliceResult[];
  /** Profiles already in the journey, so not re-entered. */
  skipped: { profileId: string; journeyKey: string; reason: string }[];
}

/**
 * Starts instances for every journey listening for this event.
 *
 * One event can start several journeys; a profile already in one is not
 * re-entered, because that would run two copies of the same countdown and
 * send everything twice.
 */
export async function startInstancesForEvent(
  event: CustomerEvent,
  options: RunnerOptions = {},
): Promise<StartResult> {
  const now = options.now ?? new Date();
  const context = await loadContext();
  const profile = await getProfile(event.profileId);

  if (!profile) {
    return {
      started: [],
      skipped: [{ profileId: event.profileId, journeyKey: "—", reason: "No such client." }],
    };
  }

  // Only live journeys listening for this exact event, and only the current
  // version of each lineage.
  const listening = context.journeys.filter(
    (journey) =>
      journey.status === "published" &&
      journey.trigger.type === "event" &&
      journey.trigger.name === event.name &&
      resolveJourneyByKey(journey.key, context.journeys)?.id === journey.id,
  );

  const started: SliceResult[] = [];
  const skipped: StartResult["skipped"] = [];

  for (const journey of listening) {
    const existing = await activeInstance(profile.id, journey.key);
    if (existing) {
      skipped.push({
        profileId: profile.id,
        journeyKey: journey.key,
        reason: `Already in this journey since ${existing.enteredAt}.`,
      });
      continue;
    }

    const experiment = context.experiments.findLiveForJourney(journey.key);

    const instance: JourneyInstance = {
      id: `inst_${Math.random().toString(36).slice(2, 11)}`,
      profileId: profile.id,
      journeyKey: journey.key,
      journeyId: journey.id,
      journeyVersion: journey.version,
      journeyName: journey.name,
      currentNodeId: null,
      status: "running",
      wakeAt: null,
      context: event,
      // Frozen here so a later reallocation cannot move someone mid-flight.
      assignment: experiment ? assignProfile(experiment, profile.id) : undefined,
      enteredAt: now.toISOString(),
      updatedAt: now.toISOString(),
      completedAt: null,
      stepCount: 0,
    };

    started.push(await advance(instance, profile, journey, context, options));
  }

  return { started, skipped };
}

export interface ResumeSummary {
  resumed: number;
  completed: number;
  stillWaiting: number;
  failed: number;
  messages: number;
  details: { instanceId: string; profileId: string; journey: string; outcome: string }[];
}

/**
 * Resumes every instance whose wake time has passed.
 *
 * This is what a cron calls. Each instance is advanced and persisted
 * independently, so one failure cannot roll back the others — a journey with
 * a broken node should not stop every other client's reminders.
 */
export async function resumeDueInstances(
  options: RunnerOptions = {},
): Promise<ResumeSummary> {
  const now = options.now ?? new Date();
  const context = await loadContext();
  const due = await dueInstances(now);

  const profiles = new Map((await listProfiles()).map((profile) => [profile.id, profile]));

  const summary: ResumeSummary = {
    resumed: 0,
    completed: 0,
    stillWaiting: 0,
    failed: 0,
    messages: 0,
    details: [],
  };

  for (const instance of due) {
    const profile = profiles.get(instance.profileId);
    // The journey version is pinned on the instance, so an edit published
    // while someone was waiting cannot change the path under their feet.
    const journey = context.journeys.find((item) => item.id === instance.journeyId);

    if (!profile || !journey) {
      const failed: JourneyInstance = {
        ...instance,
        status: "failed",
        wakeAt: null,
        updatedAt: now.toISOString(),
        completedAt: now.toISOString(),
        lastError: profile
          ? `Journey version ${instance.journeyId} no longer exists.`
          : "Client no longer exists.",
      };
      await saveInstance(failed);
      summary.failed += 1;
      summary.details.push({
        instanceId: instance.id,
        profileId: instance.profileId,
        journey: instance.journeyName,
        outcome: failed.lastError ?? "failed",
      });
      continue;
    }

    try {
      const slice = await advance(instance, profile, journey, context, options);
      summary.resumed += 1;
      summary.messages += slice.sends.length;

      if (slice.instance.status === "waiting") summary.stillWaiting += 1;
      else if (slice.instance.status === "failed") summary.failed += 1;
      else summary.completed += 1;

      summary.details.push({
        instanceId: instance.id,
        profileId: profile.id,
        journey: journey.name,
        outcome: `${slice.instance.status}${slice.sends.length ? ` · ${slice.sends.length} message(s)` : ""}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      await saveInstance({
        ...instance,
        status: "failed",
        wakeAt: null,
        updatedAt: now.toISOString(),
        completedAt: now.toISOString(),
        lastError: message,
      });
      summary.failed += 1;
      summary.details.push({
        instanceId: instance.id,
        profileId: instance.profileId,
        journey: instance.journeyName,
        outcome: `failed: ${message}`,
      });
    }
  }

  return summary;
}
