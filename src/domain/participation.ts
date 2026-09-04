export type ParticipationStatus = "waiting" | "in_progress" | "completed" | "exited";

/** A profile's live position inside a journey. Seeded for the PoC. */
export interface JourneyParticipation {
  id: string;
  profileId: string;
  journeyId: string;
  /** Lineage key, so a participation survives the journey being versioned. */
  journeyKey: string;
  journeyName: string;
  status: ParticipationStatus;
  currentStep: string;
  enteredAt: string;
  nextEvaluationAt: string | null;
}

export const PARTICIPATION_TONE: Record<ParticipationStatus, "positive" | "neutral" | "warning"> = {
  waiting: "warning",
  in_progress: "positive",
  completed: "neutral",
  exited: "neutral",
};

export const PARTICIPATION_LABEL: Record<ParticipationStatus, string> = {
  waiting: "Waiting",
  in_progress: "In progress",
  completed: "Completed",
  exited: "Exited",
};
