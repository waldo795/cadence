"use client";

import * as React from "react";
import type { CustomerEvent, JsonValue } from "@/domain/event";
import type { JourneyDefinition } from "@/domain/journey";
import type { Profile } from "@/domain/profile";
import {
  getEventTemplates,
  journeyDirectory,
  messageHistoryFor,
  resolveJourneyDefinition,
} from "@/services/local-store";
import { experimentDirectory } from "@/services/experiments";
import { simulationEngine } from "@/simulation/engine";
import type { SimulationRun } from "@/simulation/types";
import type { SimulationOverlay } from "@/components/journey/flow-mapping";

/** Identifies the journey shape a run was produced against. */
function structureKeyOf(journey: JourneyDefinition | null): string {
  if (!journey) return "";
  return `${journey.id}:${journey.nodes.length}:${journey.edges.length}`;
}

/**
 * Owns everything about a simulation run.
 *
 * The engine produces the whole trace up front; this hook exposes a cursor over
 * it. Step / Continue / Restart are therefore just cursor moves, and the canvas
 * overlay is a pure function of (run, cursor).
 *
 * Selections and the payload are stored as *overrides* rather than mirrored
 * state, so defaults stay derived from the journey and the chosen event instead
 * of being pushed around by effects.
 */
export function useSimulation(journey: JourneyDefinition | null, profiles: Profile[]) {
  const eventTemplates = React.useMemo(() => getEventTemplates(), []);

  const [profileOverride, setProfileOverride] = React.useState<string | null>(null);
  const [eventOverride, setEventOverride] = React.useState<string | null>(null);
  const [payloadOverride, setPayloadOverride] = React.useState<{
    eventName: string;
    text: string;
  } | null>(null);
  const [payloadError, setPayloadError] = React.useState<string | null>(null);
  const [runState, setRunState] = React.useState<{
    run: SimulationRun;
    structureKey: string;
  } | null>(null);
  /** How many steps of the trace are revealed. -1 means "not started". */
  const [cursor, setCursor] = React.useState(-1);

  const profileId = profileOverride ?? profiles[0]?.id ?? "";
  const profile = profiles.find((item) => item.id === profileId) ?? null;

  const defaultEventName =
    eventTemplates.find((template) => template.name === journey?.trigger.name)?.name ??
    eventTemplates[0]?.name ??
    "";
  const eventName = eventOverride ?? defaultEventName;

  const activeTemplate = eventTemplates.find((template) => template.name === eventName);
  const defaultPayloadText = React.useMemo(
    () => JSON.stringify(activeTemplate?.samplePayload ?? {}, null, 2),
    [activeTemplate],
  );
  const payloadText =
    payloadOverride?.eventName === eventName ? payloadOverride.text : defaultPayloadText;

  // A run is only valid for the journey shape it was produced against; editing
  // the graph invalidates it rather than leaving a stale overlay on the canvas.
  const structureKey = structureKeyOf(journey);
  const run = runState && runState.structureKey === structureKey ? runState.run : null;

  const setProfileId = React.useCallback((value: string) => setProfileOverride(value), []);

  const setEventName = React.useCallback((value: string) => {
    setEventOverride(value);
    setPayloadError(null);
  }, []);

  const setPayloadText = React.useCallback(
    (text: string) => setPayloadOverride({ eventName, text }),
    [eventName],
  );

  const start = React.useCallback(() => {
    if (!journey || !profile) return;

    let payload: Record<string, JsonValue>;
    try {
      const parsed: unknown = JSON.parse(payloadText);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setPayloadError("The payload must be a JSON object.");
        return;
      }
      payload = parsed as Record<string, JsonValue>;
    } catch (error) {
      setPayloadError(error instanceof Error ? error.message : "Invalid JSON");
      return;
    }
    setPayloadError(null);

    const event: CustomerEvent = {
      id: `sim_${Math.random().toString(36).slice(2, 9)}`,
      name: eventName,
      profileId: profile.id,
      occurredAt: new Date().toISOString(),
      payload,
    };

    setRunState({
      run: simulationEngine.run({
        journey,
        profile,
        event,
        // Exclusion nodes need what other journeys already sent this profile.
        messageHistory: messageHistoryFor(profile.id),
        directory: journeyDirectory,
        // The runtime experiment lookup, and the resolver a fork needs.
        experiments: experimentDirectory,
        resolveJourney: resolveJourneyDefinition,
      }),
      structureKey: structureKeyOf(journey),
    });
    setCursor(0);
  }, [journey, profile, payloadText, eventName]);

  const step = React.useCallback(() => {
    setCursor((value) => (run ? Math.min(value + 1, run.steps.length - 1) : value));
  }, [run]);

  const continueAll = React.useCallback(() => {
    setCursor(run ? run.steps.length - 1 : -1);
  }, [run]);

  const restart = React.useCallback(() => setCursor(0), []);

  const reset = React.useCallback(() => {
    setRunState(null);
    setCursor(-1);
  }, []);

  const revealedSteps = run ? run.steps.slice(0, cursor + 1) : [];
  const currentStep = revealedSteps.at(-1) ?? null;
  const atEnd = run ? cursor >= run.steps.length - 1 : false;

  const overlay: SimulationOverlay | undefined = React.useMemo(() => {
    if (!run || cursor < 0 || !journey) return undefined;
    // A run can span two journeys when an experiment forks the profile. Node
    // ids are only unique within a journey, so the overlay is scoped to the one
    // actually on screen.
    const revealed = run.steps
      .slice(0, cursor + 1)
      .filter((step) => step.journeyId === journey.id);
    const reachedNodeIds = new Set(revealed.map((item) => item.nodeId));

    return {
      currentNodeId: revealed.at(-1)?.nodeId ?? null,
      visitedNodeIds: reachedNodeIds,
      traversedEdgeIds: new Set(
        revealed
          .map((item) => item.traversedEdgeId)
          .filter((id): id is string => typeof id === "string"),
      ),
      // Only dim the paths not taken from nodes the run has actually reached.
      skippedEdgeIds: new Set(
        run.skippedEdgeIds.filter((edgeId) => {
          const edge = journey?.edges.find((candidate) => candidate.id === edgeId);
          return edge ? reachedNodeIds.has(edge.source) : false;
        }),
      ),
      outcomeByNodeId: new Map(revealed.map((item) => [item.nodeId, item.outcome])),
    };
  }, [run, cursor, journey]);

  return {
    eventTemplates,
    profile,
    profileId,
    setProfileId,
    eventName,
    setEventName,
    payloadText,
    setPayloadText,
    payloadError,
    run,
    cursor,
    revealedSteps,
    currentStep,
    atEnd,
    overlay,
    start,
    step,
    continueAll,
    restart,
    reset,
  };
}

export type SimulationController = ReturnType<typeof useSimulation>;
