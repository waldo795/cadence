import type { CustomerEvent, EventTemplate } from "@/domain/event";
import { journeysReferencing, resolveJourneyByKey } from "@/domain/exclusion";
import type { Experiment } from "@/domain/experiment";
import { adoptExperiments, resetExperiments } from "./experiments";
import { resetExperimentResults } from "./experiment-results";
import { resetContactPolicy } from "./governance";
import { resetScheduledTriggers } from "./scheduled-triggers";
import {
  toJourneyKey,
  type JourneyDefinition,
  type JourneyNode,
  type JourneyReference,
} from "@/domain/journey";
import type { MessageRecord } from "@/domain/message";
import type { JourneyParticipation } from "@/domain/participation";
import type { Profile } from "@/domain/profile";
import type {
  EventRepository,
  JourneyDirectory,
  JourneyRepository,
  MessageRepository,
  ParticipationRepository,
  ProfileFilter,
  ProfileRepository,
} from "./ports";
import {
  DOCUMENT_KEYS,
  persistEvents,
  persistProfiles,
  readDoc,
  readEvents,
  readMessages,
  readProfiles,
  resetAll,
  writeDoc,
} from "./storage";

interface SeededData {
  journeys: JourneyDefinition[];
  profiles: Profile[];
  events: CustomerEvent[];
  messages: MessageRecord[];
  participations: JourneyParticipation[];
  eventTemplates: EventTemplate[];
}

let cache: SeededData | null = null;

/**
 * Brings a journey saved under an earlier schema up to date.
 *
 * Journeys persist across sessions, so adding lineage keys, message keys and
 * governed caps must not strand work a user already saved. Defaults are chosen
 * so an upgraded journey behaves exactly as it did before.
 */
function migrateJourney(journey: JourneyDefinition): JourneyDefinition {
  const nodes = journey.nodes.map((node): JourneyNode => {
    // Fall back to the template name, which is what a reference would have
    // meant before message keys existed.
    if (node.kind === "send_email") {
      return node.config.messageKey
        ? node
        : { ...node, config: { ...node.config, messageKey: node.config.template } };
    }
    if (node.kind === "send_push") {
      return node.config.messageKey
        ? node
        : { ...node, config: { ...node.config, messageKey: node.config.template } };
    }

    if (node.kind === "frequency_check") {
      const config = node.config as Partial<typeof node.config> & { windowHours?: number };
      if (config.mode) return node;
      return {
        ...node,
        config: {
          mode: "local",
          channel: "email",
          maxMessages: config.maxMessages ?? 3,
          windowDays: Math.max(1, Math.round((config.windowHours ?? 24) / 24)),
        },
      };
    }

    return node;
  });

  // Experiments used to live on the journey. They are standalone records now,
  // so the embedded config is lifted out (see `liftEmbeddedExperiment`) and the
  // field dropped rather than left to rot on the definition.
  const rest: JourneyDefinition = { ...journey };
  delete (rest as { experiment?: unknown }).experiment;

  return {
    ...rest,
    key: journey.key || toJourneyKey(journey.name),
    status: journey.status ?? "draft",
    nodes,
  };
}

interface LegacyEmbeddedExperiment {
  id: string;
  name?: string;
  enabled?: boolean;
  controlPercentage?: number;
}

/**
 * Converts a journey-embedded experiment into a standalone record.
 *
 * The experiment id is preserved deliberately: it is the assignment key, so
 * carrying it across the migration keeps every profile in the group they were
 * already in. Losing it would silently re-randomise a running holdout.
 */
function liftEmbeddedExperiment(journey: JourneyDefinition): Experiment | null {
  const embedded = (journey as JourneyDefinition & { experiment?: LegacyEmbeddedExperiment })
    .experiment;
  if (!embedded?.id || typeof embedded.controlPercentage !== "number") return null;

  const control = Math.min(100, Math.max(0, embedded.controlPercentage));

  return {
    id: embedded.id,
    name: embedded.name || `${journey.name} holdout`,
    hypothesis: "Migrated from a journey-embedded holdout.",
    status: embedded.enabled === false ? "paused" : "running",
    targetJourneyKey: journey.key || toJourneyKey(journey.name),
    // Order matters. The embedded model held out the *lowest* buckets
    // (`bucket < controlPercentage`), and variants are allocated in order, so
    // the holdout must come first or every profile would swap groups.
    variants: [
      {
        id: "var_migrated_holdout",
        name: "Holdout",
        allocation: control,
        treatment: { kind: "holdout" },
      },
      {
        id: "var_migrated_treated",
        name: "Treated",
        allocation: 100 - control,
        treatment: { kind: "original" },
      },
    ],
    createdAt: journey.createdAt,
    startedAt: journey.createdAt,
  };
}

/**
 * Assembles the working view from the hydrated snapshot.
 *
 * Seeding now happens on the server before the snapshot is returned, so this no
 * longer decides whether to seed — it only reads what is there and applies the
 * schema migrations that older saved journeys still need.
 */
function load(): SeededData {
  if (cache) return cache;

  const journeys = (readDoc<JourneyDefinition[]>(DOCUMENT_KEYS.journeys) ?? []).map(
    migrateJourney,
  );

  const lifted = journeys
    .map(liftEmbeddedExperiment)
    .filter((experiment): experiment is Experiment => experiment !== null);
  adoptExperiments(lifted);

  cache = {
    journeys,
    profiles: readProfiles().map(migrateProfile),
    events: readEvents(),
    messages: readMessages(),
    participations: readDoc<JourneyParticipation[]>(DOCUMENT_KEYS.participations) ?? [],
    eventTemplates: readDoc<EventTemplate[]>(DOCUMENT_KEYS.eventTemplates) ?? [],
  };

  return cache;
}

/** Profiles saved before tags existed must not come back without the field. */
function migrateProfile(profile: Profile): Profile {
  return { ...profile, tags: profile.tags ?? [] };
}

function persistJourneys(journeys: JourneyDefinition[]): void {
  writeDoc(DOCUMENT_KEYS.journeys, journeys);
}

/** Drops all local changes and rebuilds the demo dataset on the server. */
export async function resetDemoData(): Promise<void> {
  await resetAll();
  cache = null;
  // Each service holds its own cache over the same snapshot, so clearing the
  // database is not enough — they have to be told to re-read.
  resetExperiments();
  resetExperimentResults();
  resetScheduledTriggers();
  resetContactPolicy();
  load();
}

export function getEventTemplates(): EventTemplate[] {
  return load().eventTemplates;
}

class LocalJourneyRepository implements JourneyRepository {
  async list(): Promise<JourneyDefinition[]> {
    return [...load().journeys].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  async get(id: string): Promise<JourneyDefinition | null> {
    return load().journeys.find((journey) => journey.id === id) ?? null;
  }

  async save(journey: JourneyDefinition): Promise<JourneyDefinition> {
    const store = load();
    const next = { ...journey, updatedAt: new Date().toISOString() };
    const index = store.journeys.findIndex((existing) => existing.id === journey.id);

    if (index >= 0) {
      store.journeys[index] = next;
    } else {
      store.journeys.push(next);
    }

    persistJourneys(store.journeys);
    return next;
  }

  async duplicate(id: string): Promise<JourneyDefinition | null> {
    const store = load();
    const source = store.journeys.find((journey) => journey.id === id);
    if (!source) return null;

    const now = new Date().toISOString();
    const copy: JourneyDefinition = {
      ...structuredClone(source),
      id: `journey_${Math.random().toString(36).slice(2, 9)}`,
      // A duplicate is a *new* journey, so it gets its own lineage key. Any
      // experiment targeting the original keeps targeting the original.
      key: `${source.key}-copy-${Math.random().toString(36).slice(2, 6)}`,
      name: `${source.name} (copy)`,
      status: "draft",
      version: 1,
      forkOfJourneyKey: undefined,
      supersedesId: undefined,
      supersededById: undefined,
      createdAt: now,
      updatedAt: now,
    };

    store.journeys.push(copy);
    persistJourneys(store.journeys);
    return copy;
  }

  /**
   * Copies a journey as an experiment fork.
   *
   * Distinct from `duplicate` in intent: the fork is a variant of a live
   * experience, so it records what it forked from and is published straight
   * away — a variant that sits in draft would never receive traffic.
   */
  async createExperimentFork(id: string, name: string): Promise<JourneyDefinition | null> {
    const store = load();
    const source = store.journeys.find((journey) => journey.id === id);
    if (!source) return null;

    const now = new Date().toISOString();
    const fork: JourneyDefinition = {
      ...structuredClone(source),
      id: `journey_${Math.random().toString(36).slice(2, 9)}`,
      key: `${source.key}-${toJourneyKey(name) || "variant"}`.slice(0, 60),
      name,
      status: "published",
      version: 1,
      tags: ["Experiment fork"],
      forkOfJourneyKey: source.key,
      supersedesId: undefined,
      supersededById: undefined,
      createdAt: now,
      updatedAt: now,
    };

    store.journeys.push(fork);
    persistJourneys(store.journeys);
    return fork;
  }

  /**
   * Stops the current version and opens a fresh draft in the same lineage.
   *
   * The key and the experiment id are carried over deliberately: inbound
   * exclusion references resolve by key, so they follow the new version without
   * being rewritten, and the control group stays stable across the rebuild.
   */
  async createNewVersion(id: string): Promise<JourneyDefinition | null> {
    const store = load();
    const source = store.journeys.find((journey) => journey.id === id);
    if (!source) return null;

    const now = new Date().toISOString();
    const newId = `journey_${Math.random().toString(36).slice(2, 9)}`;

    const next: JourneyDefinition = {
      ...structuredClone(source),
      id: newId,
      key: source.key,
      version: source.version + 1,
      status: "draft",
      supersedesId: source.id,
      supersededById: undefined,
      createdAt: now,
      updatedAt: now,
    };

    const archived: JourneyDefinition = {
      ...source,
      status: "archived",
      supersededById: newId,
      updatedAt: now,
    };

    store.journeys = store.journeys.map((journey) =>
      journey.id === source.id ? archived : journey,
    );
    store.journeys.push(next);
    persistJourneys(store.journeys);
    return next;
  }

  async referencesTo(key: string): Promise<JourneyDefinition[]> {
    return journeysReferencing(key, load().journeys);
  }

  async remove(id: string): Promise<void> {
    const store = load();
    store.journeys = store.journeys.filter((journey) => journey.id !== id);
    persistJourneys(store.journeys);
  }
}

/** Resolves lineage keys to whichever version is live right now. */
class LocalJourneyDirectory implements JourneyDirectory {
  resolve(key: string): JourneyReference | null {
    return resolveJourneyByKey(key, load().journeys);
  }

  list(): JourneyReference[] {
    const seen = new Map<string, JourneyReference>();
    for (const journey of load().journeys) {
      if (seen.has(journey.key)) continue;
      const reference = resolveJourneyByKey(journey.key, load().journeys);
      if (reference) seen.set(journey.key, reference);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

class LocalProfileRepository implements ProfileRepository {
  async list(filter?: ProfileFilter): Promise<Profile[]> {
    let profiles = [...load().profiles];

    if (filter?.query) {
      const query = filter.query.trim().toLowerCase();
      profiles = profiles.filter((profile) =>
        [
          profile.firstName,
          profile.lastName,
          `${profile.firstName} ${profile.lastName}`,
          profile.customerId,
          profile.email,
          profile.country,
          profile.loyaltyTier,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query),
      );
    }

    if (filter?.loyaltyTier) {
      profiles = profiles.filter((profile) => profile.loyaltyTier === filter.loyaltyTier);
    }
    if (filter?.appInstalled !== undefined) {
      profiles = profiles.filter((profile) => profile.appInstalled === filter.appInstalled);
    }
    if (filter?.country) {
      profiles = profiles.filter((profile) => profile.country === filter.country);
    }

    return profiles;
  }

  async get(id: string): Promise<Profile | null> {
    return load().profiles.find((profile) => profile.id === id) ?? null;
  }
}

class LocalEventRepository implements EventRepository {
  async listForProfile(profileId: string): Promise<CustomerEvent[]> {
    return load().events.filter((event) => event.profileId === profileId);
  }

  async listRecent(limit = 20): Promise<CustomerEvent[]> {
    return load().events.slice(0, limit);
  }
}

class LocalMessageRepository implements MessageRepository {
  async listForProfile(profileId: string): Promise<MessageRecord[]> {
    return load().messages.filter((message) => message.profileId === profileId);
  }
}

class LocalParticipationRepository implements ParticipationRepository {
  async listForProfile(profileId: string): Promise<JourneyParticipation[]> {
    return load().participations.filter((participation) => participation.profileId === profileId);
  }

  async countForJourney(journeyId: string): Promise<number> {
    return load().participations.filter(
      (participation) =>
        participation.journeyId === journeyId && participation.status !== "completed",
    ).length;
  }
}

export const journeyRepository: JourneyRepository = new LocalJourneyRepository();
export const journeyDirectory: JourneyDirectory = new LocalJourneyDirectory();

/** Synchronous read used by the simulator, which needs history mid-run. */
export function messageHistoryFor(profileId: string) {
  return load().messages.filter((message) => message.profileId === profileId);
}

export function allJourneysSync(): JourneyDefinition[] {
  return load().journeys;
}

/**
 * Appends events emitted by scheduled triggers to the log.
 *
 * They are written to the same store the website/booking system would write to,
 * so a journey cannot tell the difference between a countdown event and a real
 * one — which is exactly the point of emitting an event rather than running the
 * journey directly.
 */
export function appendEvents(events: CustomerEvent[]): void {
  if (events.length === 0) return;
  const store = load();
  store.events = [...events, ...store.events].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
  persistEvents(events);
}

/** Applies tags to profiles, so a trigger can build a segment as well as fire. */
export function applyProfileTags(tagsByProfileId: Map<string, string[]>): void {
  if (tagsByProfileId.size === 0) return;
  const store = load();
  const changed: Profile[] = [];

  store.profiles = store.profiles.map((profile) => {
    const additions = tagsByProfileId.get(profile.id);
    if (!additions) return profile;
    const merged = [...new Set([...(profile.tags ?? []), ...additions])];
    const updated = { ...profile, tags: merged };
    changed.push(updated);
    return updated;
  });

  // Only the profiles that actually changed are written. Rewriting the whole
  // list would clobber a client the intake endpoint added moments earlier.
  persistProfiles(changed);
}

/** Adds a profile captured by the sign-up form. */
export function addProfile(profile: Profile): void {
  const store = load();
  store.profiles = [profile, ...store.profiles];
  persistProfiles([profile]);
}

export function allProfilesSync(): Profile[] {
  return load().profiles;
}

export function eventsForProfile(profileId: string): CustomerEvent[] {
  return load().events.filter((event) => event.profileId === profileId);
}

/** Resolves a lineage key to a runnable definition, for experiment forks. */
export function resolveJourneyDefinition(journeyKey: string): JourneyDefinition | null {
  const reference = resolveJourneyByKey(journeyKey, load().journeys);
  if (!reference) return null;
  return load().journeys.find((journey) => journey.id === reference.id) ?? null;
}
export const profileRepository: ProfileRepository = new LocalProfileRepository();
export const eventRepository: EventRepository = new LocalEventRepository();
export const messageRepository: MessageRepository = new LocalMessageRepository();
export const participationRepository: ParticipationRepository = new LocalParticipationRepository();
