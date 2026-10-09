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
export async function seedDatabase(now = new Date()): Promise<void> {
  const profiles = seedProfiles(now);

  await upsertProfiles(profiles);
  await insertEvents(seedEvents(now, profiles.map((profile) => profile.id)));
  await insertMessages(seedMessages(now, profiles));

  const experiments = seedExperiments();

  await writeDocument(DOCUMENT_KEYS.seededAt, now.toISOString());
  await writeDocument(DOCUMENT_KEYS.journeys, seedJourneys(now));
  await writeDocument(DOCUMENT_KEYS.eventTemplates, seedEventTemplates(now));
  await writeDocument(DOCUMENT_KEYS.participations, seedParticipations(now, profiles));
  await writeDocument(DOCUMENT_KEYS.contactPolicy, seedContactPolicy());
  await writeDocument(DOCUMENT_KEYS.experiments, experiments);
  await writeDocument(DOCUMENT_KEYS.scheduledTriggers, seedScheduledTriggers());
  await writeDocument(DOCUMENT_KEYS.firedTriggers, []);
  await writeDocument(DOCUMENT_KEYS.experimentBaselines, seedExperimentBaselines());
  await writeDocument(
    DOCUMENT_KEYS.exposures,
    seedExperimentExposures(now, experiments, profiles.map((profile) => profile.id)),
  );
}

/** Seeds only if nothing is there, so a restart never overwrites real clients. */
export async function ensureSeeded(): Promise<void> {
  if (!(await isEmpty())) return;
  await seedDatabase();
}

export async function resetDatabase(): Promise<void> {
  await clearAll();
  await seedDatabase();
}
