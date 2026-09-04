import { seedMessages, seedParticipations } from "@/seed/engagement";
import { seedEvents, seedEventTemplates } from "@/seed/events";
import { seedContactPolicy } from "@/seed/governance";
import { seedExperiments } from "@/seed/experiments";
import { seedExperimentBaselines, seedExperimentExposures } from "@/seed/experiment-results";
import { seedJourneys } from "@/seed/journeys";
import { seedProfiles } from "@/seed/profiles";
import { seedScheduledTriggers } from "@/seed/scheduled-triggers";
import { DOCUMENT_KEYS } from "@/shared/keys";
import { isEmpty } from "./db";
import {
  clearAll,
  insertEvents,
  insertMessages,
  upsertProfiles,
  writeDocument,
} from "./store";

/**
 * Populates an empty database.
 *
 * The seed date is written as a document so every load derives the same
 * relative dates. Without it, "91 days before the wedding" would drift each
 * time the app restarted and the countdown demo would stop lining up.
 */
export function seedDatabase(now = new Date()): void {
  const profiles = seedProfiles(now);

  upsertProfiles(profiles);
  insertEvents(seedEvents(now, profiles.map((profile) => profile.id)));
  insertMessages(seedMessages(now, profiles));

  const experiments = seedExperiments();

  writeDocument(DOCUMENT_KEYS.seededAt, now.toISOString());
  writeDocument(DOCUMENT_KEYS.journeys, seedJourneys(now));
  writeDocument(DOCUMENT_KEYS.eventTemplates, seedEventTemplates(now));
  writeDocument(DOCUMENT_KEYS.participations, seedParticipations(now, profiles));
  writeDocument(DOCUMENT_KEYS.contactPolicy, seedContactPolicy());
  writeDocument(DOCUMENT_KEYS.experiments, experiments);
  writeDocument(DOCUMENT_KEYS.scheduledTriggers, seedScheduledTriggers());
  writeDocument(DOCUMENT_KEYS.firedTriggers, []);
  writeDocument(DOCUMENT_KEYS.experimentBaselines, seedExperimentBaselines());
  writeDocument(
    DOCUMENT_KEYS.exposures,
    seedExperimentExposures(now, experiments, profiles.map((profile) => profile.id)),
  );
}

/** Seeds only if nothing is there, so a restart never overwrites real clients. */
export function ensureSeeded(): void {
  if (!isEmpty()) return;
  seedDatabase();
}

export function resetDatabase(): void {
  clearAll();
  seedDatabase();
}
