"use client";

import * as React from "react";
import type { CustomerEvent } from "@/domain/event";
import type { JourneyDefinition } from "@/domain/journey";
import type { MessageRecord } from "@/domain/message";
import type { JourneyParticipation } from "@/domain/participation";
import type { Profile } from "@/domain/profile";
import {
  eventRepository,
  journeyRepository,
  messageRepository,
  participationRepository,
  profileRepository,
} from "@/services/local-store";
import type { ProfileFilter } from "@/services/ports";

/**
 * Repositories are async by design (so they can become network calls later),
 * which means every page needs a loading state even though the PoC resolves
 * instantly from localStorage.
 *
 * `loading` is derived by comparing the key the resolved data was fetched for
 * against the key being requested now — no effect has to push a loading flag.
 */
function useAsync<T>(load: () => Promise<T>, key: string) {
  const [nonce, setNonce] = React.useState(0);
  const [resolved, setResolved] = React.useState<{ key: string; data: T } | null>(null);

  const requestKey = `${key}::${nonce}`;

  // Callers pass an inline closure, so the loader is held in a ref and the
  // fetch effect keys off `requestKey` alone rather than the function identity.
  const loadRef = React.useRef(load);
  React.useEffect(() => {
    loadRef.current = load;
  });

  React.useEffect(() => {
    let cancelled = false;
    void loadRef.current().then((data) => {
      if (!cancelled) setResolved({ key: requestKey, data });
    });
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  const fresh = resolved?.key === requestKey;
  const reload = React.useCallback(() => setNonce((value) => value + 1), []);

  // Stale data is still returned while a new key resolves, which keeps lists
  // from flashing empty between filter changes.
  return { data: resolved?.data ?? null, loading: !fresh, reload };
}

export function useJourneys() {
  const { data, loading, reload } = useAsync<JourneyDefinition[]>(
    () => journeyRepository.list(),
    "journeys",
  );
  return { journeys: data ?? [], loading, reload };
}

export function useJourney(id: string) {
  const { data, loading, reload } = useAsync<JourneyDefinition | null>(
    () => journeyRepository.get(id),
    `journey:${id}`,
  );
  return { journey: data, loading, reload };
}

export function useProfiles(filter: ProfileFilter) {
  const { data, loading } = useAsync<Profile[]>(
    () => profileRepository.list(filter),
    `profiles:${JSON.stringify(filter)}`,
  );
  return { profiles: data ?? [], loading };
}

export function useAllProfiles() {
  const { data, loading } = useAsync<Profile[]>(() => profileRepository.list(), "profiles:all");
  return { profiles: data ?? [], loading };
}

export interface ProfileDetail {
  profile: Profile | null;
  events: CustomerEvent[];
  messages: MessageRecord[];
  participations: JourneyParticipation[];
}

export function useProfileDetail(id: string) {
  const { data, loading } = useAsync<ProfileDetail>(async () => {
    const [profile, events, messages, participations] = await Promise.all([
      profileRepository.get(id),
      eventRepository.listForProfile(id),
      messageRepository.listForProfile(id),
      participationRepository.listForProfile(id),
    ]);
    return { profile, events, messages, participations };
  }, `profile-detail:${id}`);

  return {
    detail: data ?? { profile: null, events: [], messages: [], participations: [] },
    loading,
  };
}

export function useJourneyActivity(journeys: JourneyDefinition[]) {
  const ids = journeys.map((journey) => journey.id).join(",");
  const { data } = useAsync<Record<string, number>>(async () => {
    const entries = await Promise.all(
      journeys.map(
        async (journey) =>
          [journey.id, await participationRepository.countForJourney(journey.id)] as const,
      ),
    );
    return Object.fromEntries(entries);
  }, `activity:${ids}`);
  return data ?? {};
}

export function useRecentEvents(limit = 8) {
  const { data, loading } = useAsync<CustomerEvent[]>(
    () => eventRepository.listRecent(limit),
    `events:${limit}`,
  );
  return { events: data ?? [], loading };
}
