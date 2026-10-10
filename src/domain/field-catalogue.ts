import type { CustomerEvent, EventTemplate } from "./event";
import type { JourneyDefinition } from "./journey";
import { profileContext, type Profile } from "./profile";

/**
 * What can be merged into an email, built from the data that actually exists.
 *
 * Deliberately not a hardcoded list. A profile carries a fixed set of columns
 * *and* a loose attribute bag that grows as Annie records more about her
 * clients, and every journey listens for a different event with its own
 * payload. A fixed list would be wrong the first time she adds a field.
 */

export interface MergeField {
  /** The dot path, used as `{{path}}`. */
  path: string;
  label: string;
  /** A real value from the data, so you can see what you are about to insert. */
  sample?: string;
  /** How many of the records sampled actually carry it. */
  coverage?: { present: number; total: number };
}

export interface FieldGroup {
  id: string;
  label: string;
  description: string;
  fields: MergeField[];
}

/** Turns a camelCase or snake_case key into something readable. */
function humanise(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function sampleOf(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * The fields available to a journey's emails.
 *
 * `profiles` and `events` are sampled rather than exhaustively scanned — a few
 * hundred records is plenty to discover which keys exist, and coverage is
 * reported so a field only half the clients have is visibly risky before you
 * use it.
 */
export function buildFieldCatalogue(args: {
  /**
   * Absent when editing a template, which belongs to no journey. The event
   * group then offers what every declared trigger carries, since the template
   * may end up in any of them.
   */
  journey?: JourneyDefinition | null;
  profiles: Profile[];
  events: CustomerEvent[];
  eventTemplates: EventTemplate[];
  /** The client the designer is previewing, so samples match the preview. */
  focus?: Profile | null;
}): FieldGroup[] {
  const { journey, profiles, events, eventTemplates, focus } = args;

  const sampleProfiles = profiles.slice(0, 200);
  const reference = focus ?? sampleProfiles[0] ?? null;
  const referenceContext = reference ? profileContext(reference) : {};

  /* ---------------------------------------------------------------------- */
  /* Profile                                                                */
  /* ---------------------------------------------------------------------- */

  // The fixed columns, in the order they are most likely to be wanted.
  const CORE = [
    "firstName",
    "lastName",
    "fullName",
    "email",
    "mobile",
    "loyaltyTier",
    "country",
    "preferredLanguage",
    "engagementTier",
    "engagementScore",
    "lifetimeValue",
    "tenureDays",
    "tags",
  ];

  const coverage = (key: string) => {
    if (sampleProfiles.length === 0) return undefined;
    const present = sampleProfiles.filter((profile) => {
      const value = profileContext(profile)[key];
      return value !== undefined && value !== null && value !== "";
    }).length;
    return { present, total: sampleProfiles.length };
  };

  const profileFields: MergeField[] = CORE.map((key) => ({
    path: `profile.${key}`,
    label: humanise(key),
    sample: sampleOf(referenceContext[key]),
    coverage: coverage(key),
  }));

  /*
   * Attributes are the "associated" data: whatever has been recorded about a
   * client beyond the fixed columns — wedding date, venue, package, trial
   * date. Discovered by union across the sample, because no two clients
   * necessarily carry the same ones.
   */
  const attributeKeys = new Set<string>();
  for (const profile of sampleProfiles) {
    for (const key of Object.keys(profile.attributes ?? {})) attributeKeys.add(key);
  }

  const attributeFields: MergeField[] = [...attributeKeys].sort().map((key) => ({
    path: `profile.${key}`,
    label: humanise(key),
    sample: sampleOf(referenceContext[key]),
    coverage: coverage(key),
  }));

  /* ---------------------------------------------------------------------- */
  /* Event                                                                  */
  /* ---------------------------------------------------------------------- */

  /*
   * The payload of the event this journey listens for. Taken from the
   * declared template where there is one, and union'd with what real events
   * of that name have actually carried — a template can fall behind what is
   * being sent, and the real traffic is the thing that will be there at
   * send time.
   */
  const triggerName = journey?.trigger.name ?? null;
  const template = triggerName
    ? eventTemplates.find((item) => item.name === triggerName)
    : undefined;

  const matching = triggerName
    ? events.filter((event) => event.name === triggerName).slice(0, 50)
    : events.slice(0, 100);

  const payloadKeys = new Set<string>(Object.keys(template?.samplePayload ?? {}));
  if (!triggerName) {
    // No journey: offer the union of every declared trigger's payload, since
    // the template could be used by any of them.
    for (const item of eventTemplates) {
      for (const key of Object.keys(item.samplePayload ?? {})) payloadKeys.add(key);
    }
  }
  for (const event of matching) {
    for (const key of Object.keys(event.payload ?? {})) payloadKeys.add(key);
  }

  const focusEvent = focus
    ? matching.find((event) => event.profileId === focus.id) ?? matching[0]
    : matching[0];

  const eventFields: MergeField[] = [
    { path: "event.name", label: "Event name", sample: triggerName ?? undefined },
    {
      path: "event.occurredAt",
      label: "When it happened",
      sample: focusEvent?.occurredAt,
    },
    ...[...payloadKeys].sort().map((key) => ({
      path: `event.${key}`,
      label: humanise(key),
      sample: sampleOf(
        focusEvent?.payload?.[key] ?? (template?.samplePayload ?? {})[key],
      ),
      coverage:
        matching.length > 0
          ? {
              present: matching.filter(
                (event) =>
                  event.payload?.[key] !== undefined && event.payload?.[key] !== null,
              ).length,
              total: matching.length,
            }
          : undefined,
    })),
  ];

  /* ---------------------------------------------------------------------- */

  const groups: FieldGroup[] = [
    {
      id: "profile",
      label: "Client",
      description: "Fields every client record has.",
      fields: profileFields,
    },
  ];

  if (attributeFields.length > 0) {
    groups.push({
      id: "attributes",
      label: "Client details",
      description: "Recorded about the client — wedding date, venue, package and the like.",
      fields: attributeFields,
    });
  }

  groups.push({
    id: "event",
    label: triggerName ? "This journey's trigger" : "Trigger event",
    description: triggerName
      ? `Carried by , which is what starts this journey.`
      : "Carried by whichever event starts the journey this is used in. Not every field is available to every journey.",
    fields: eventFields,
  });

  groups.push({
    id: "journey",
    label: "Journey",
    description: "About the journey sending the message.",
    fields: [
      { path: "journey.name", label: "Journey name", sample: journey?.name },
      {
        path: "journey.version",
        label: "Version",
        sample: journey ? String(journey.version) : undefined,
      },
    ],
  });

  return groups;
}

/** True when a field is missing often enough to be worth warning about. */
export function isPatchy(field: MergeField): boolean {
  if (!field.coverage || field.coverage.total === 0) return false;
  return field.coverage.present / field.coverage.total < 0.9;
}
