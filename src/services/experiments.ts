import { isLive, type Experiment } from "@/domain/experiment";
import type { ExperimentDirectory, ExperimentRepository } from "./ports";
import { DOCUMENT_KEYS, readDoc, writeDoc } from "./storage";

/**
 * Experiments are stored independently of journeys.
 *
 * That separation is the point: putting a journey under test, or ending a test,
 * never touches the journey definition — so a live experience is not
 * interrupted, redeployed or versioned just to run an experiment.
 */

let cached: Experiment[] | null = null;

function load(): Experiment[] {
  if (cached) return cached;
  cached = readDoc<Experiment[]>(DOCUMENT_KEYS.experiments) ?? [];
  return cached;
}

function persist(experiments: Experiment[]): void {
  cached = experiments;
  writeDoc(DOCUMENT_KEYS.experiments, experiments);
}

export function resetExperiments(): void {
  cached = null;
  load();
}

/** Adds experiments migrated out of an older, journey-embedded schema. */
export function adoptExperiments(migrated: Experiment[]): void {
  if (migrated.length === 0) return;
  const existing = load();
  const known = new Set(existing.map((experiment) => experiment.id));
  const additions = migrated.filter((experiment) => !known.has(experiment.id));
  if (additions.length > 0) persist([...existing, ...additions]);
}

export function allExperimentsSync(): Experiment[] {
  return load();
}

class LocalExperimentRepository implements ExperimentRepository {
  async list(): Promise<Experiment[]> {
    return [...load()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async get(id: string): Promise<Experiment | null> {
    return load().find((experiment) => experiment.id === id) ?? null;
  }

  async save(experiment: Experiment): Promise<Experiment> {
    const experiments = load();
    const index = experiments.findIndex((existing) => existing.id === experiment.id);
    const next = [...experiments];
    if (index >= 0) next[index] = experiment;
    else next.push(experiment);
    persist(next);
    return experiment;
  }

  async remove(id: string): Promise<void> {
    persist(load().filter((experiment) => experiment.id !== id));
  }
}

/**
 * The runtime lookup performed on journey entry.
 *
 * Only one running experiment may intercept a journey at a time — overlapping
 * tests on the same audience would confound each other's results, so the first
 * running one wins and the editor warns about the rest.
 */
class LocalExperimentDirectory implements ExperimentDirectory {
  findLiveForJourney(journeyKey: string): Experiment | null {
    return (
      load().find(
        (experiment) => experiment.targetJourneyKey === journeyKey && isLive(experiment),
      ) ?? null
    );
  }

  listForJourney(journeyKey: string): Experiment[] {
    return load().filter((experiment) => experiment.targetJourneyKey === journeyKey);
  }
}

export const experimentRepository: ExperimentRepository = new LocalExperimentRepository();
export const experimentDirectory: ExperimentDirectory = new LocalExperimentDirectory();
